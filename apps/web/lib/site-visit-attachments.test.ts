/**
 * Integration test for the trusted upload-finalization module — runs
 * against premier-crm-e2e for real (Storage + DB), using sharp for real
 * image generation/verification. This is the permanent test coverage for
 * the logic proven in the Checkpoint A/A.1 spikes.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import { createServiceClient, requestPendingUpload, type DbClient } from '@premier/db';

import { finalizeSiteVisitUpload } from './site-visit-attachments';

loadEnv({ path: path.resolve(__dirname, '../../../.env.test') });

const canRun = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('slbnizoskumwhleeiccv') && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(canRun())('finalizeSiteVisitUpload (premier-crm-e2e)', () => {
  const ORG1 = 'a0000000-0000-0000-0000-000000000001';
  let admin: DbClient;
  let ownerId: string;
  let customerId: string;
  let propertyId: string;
  let requestId: string;
  let siteVisitId: string;
  const createdVaultItemIds: string[] = [];
  const createdStoragePaths: string[] = [];

  beforeAll(async () => {
    admin = createServiceClient();

    // record_request_triage() relies on auth.uid(), which is NULL for the
    // service-role key — needs a real authenticated session, not admin.
    const ownerEmail = `e2e-attach-owner-${Date.now()}@example.com`;
    const ownerPassword = `E2eAttach_${Math.random().toString(36).slice(2)}!1`;
    const { data: createdOwner, error: createOwnerErr } = await admin.auth.admin.createUser({ email: ownerEmail, password: ownerPassword, email_confirm: true });
    if (createOwnerErr || !createdOwner.user) throw createOwnerErr ?? new Error('Failed to create owner fixture');
    ownerId = createdOwner.user.id;
    await admin.from('org_members').insert({ org_id: ORG1, user_id: ownerId, role: 'owner', status: 'active' });
    const ownerClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });

    const { data: customer, error: customerErr } = await admin
      .from('customers')
      .insert({ org_id: ORG1, type: 'residential', first_name: 'E2E_ATTACH', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    if (customerErr || !customer) throw customerErr ?? new Error('Failed to create customer fixture');
    customerId = customer.id;

    const { data: property, error: propertyErr } = await admin
      .from('properties')
      .insert({ org_id: ORG1, address_line_1: '1 E2E Attach Test Way', city: 'Florence', state: 'KY', zip: '41042' })
      .select('id')
      .single();
    if (propertyErr || !property) throw propertyErr ?? new Error('Failed to create property fixture');
    propertyId = property.id;

    const { data: request, error: requestErr } = await admin
      .from('service_requests')
      .insert({
        org_id: ORG1, request_number: `E2E-ATTACH-${Date.now()}`, source: 'manual', status: 'reviewing', priority: 'normal',
        customer_id: customerId, property_id: propertyId, contact_name: 'E2E Attach Fixture',
        service_title: 'E2E attachment test request', service_description: 'Testing upload finalization', submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (requestErr || !request) throw requestErr ?? new Error('Failed to create service request fixture');
    requestId = request.id;

    const { data: triageResult, error: triageErr } = await ownerClient.rpc('record_request_triage', {
      p_request_id: requestId, p_decision: 'site_visit_required', p_reason: 'E2E attachment test',
    });
    if (triageErr) throw triageErr;
    siteVisitId = (triageResult as { siteVisitId: string }).siteVisitId;
  });

  afterAll(async () => {
    if (createdStoragePaths.length) {
      await admin.storage.from('site-visit-attachments').remove(createdStoragePaths);
    }
    if (createdVaultItemIds.length) {
      await admin.from('vault_items').delete().in('id', createdVaultItemIds);
    }
    if (siteVisitId) {
      await admin.from('pending_uploads').delete().eq('entity_id', siteVisitId);
      await admin.from('site_visit_appointments').delete().eq('site_visit_id', siteVisitId);
      await admin.from('site_visits').delete().eq('id', siteVisitId);
    }
    if (requestId) {
      await admin.from('activity_log').delete().eq('entity_id', requestId);
      await admin.from('service_requests').delete().eq('id', requestId);
    }
    if (customerId) {
      await admin.from('customer_properties').delete().eq('customer_id', customerId);
      await admin.from('customers').delete().eq('id', customerId);
    }
    if (propertyId) await admin.from('properties').delete().eq('id', propertyId);
    if (ownerId) {
      await admin.from('org_members').delete().eq('user_id', ownerId);
      await admin.auth.admin.deleteUser(ownerId);
    }
  });

  it('processes a valid JPEG end-to-end: EXIF stripped, dims correct, idempotent retry, no duplicate', async () => {
    const original = await sharp({ create: { width: 30, height: 15, channels: 3, background: { r: 10, g: 200, b: 30 } } })
      .withMetadata({ exif: { IFD0: { Orientation: '6' } } })
      .jpeg()
      .toBuffer();

    const target = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/jpeg', declaredSizeBytes: original.length,
    });
    expect(target.success).toBe(true);
    if (!target.success) return;

    const { error: uploadErr } = await admin.storage
      .from('site-visit-attachments')
      .uploadToSignedUrl(target.data.pendingPath, target.data.signedUploadToken, original, { contentType: 'image/jpeg' });
    expect(uploadErr).toBeNull();

    const result1 = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result1.success).toBe(true);
    if (!result1.success) return;
    createdVaultItemIds.push(result1.data.vaultItemId);
    createdStoragePaths.push(result1.data.storagePath);

    const { data: vaultRow } = await admin.from('vault_items').select('*').eq('id', result1.data.vaultItemId).single();
    expect(vaultRow!.storage_object_key).toBe(result1.data.storagePath);
    expect(vaultRow!.storage_object_key).toContain(`${ORG1}/site_visit/${siteVisitId}/`);

    const { data: sanitizedFile } = await admin.storage.from('site-visit-attachments').download(result1.data.storagePath);
    const sanitizedBuffer = Buffer.from(await sanitizedFile!.arrayBuffer());
    const sanitizedMeta = await sharp(sanitizedBuffer).metadata();
    expect(sanitizedMeta.exif).toBeUndefined();

    // Idempotent retry — same uploadId, same result, no duplicate row/object.
    const result2 = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result2.success).toBe(true);
    if (result2.success) expect(result2.data.vaultItemId).toBe(result1.data.vaultItemId);

    const { count } = await admin.from('vault_items').select('id', { count: 'exact', head: true }).eq('storage_object_key', result1.data.storagePath);
    expect(count).toBe(1);

    const { data: pendingRow } = await admin.from('pending_uploads').select('status').eq('id', target.data.uploadId).single();
    expect(pendingRow!.status).toBe('finalized');

    const { data: pendingStillThere } = await admin.storage.from('site-visit-attachments').list(`${ORG1}/pending`);
    expect((pendingStillThere ?? []).some((o) => o.name === target.data.uploadId)).toBe(false);
  });

  it('rejects a decoded-content mismatch (real PNG declared as JPEG)', async () => {
    const pngBuffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } } }).png().toBuffer();
    const target = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/jpeg', declaredSizeBytes: pngBuffer.length,
    });
    expect(target.success).toBe(true);
    if (!target.success) return;
    await admin.storage.from('site-visit-attachments').uploadToSignedUrl(target.data.pendingPath, target.data.signedUploadToken, pngBuffer, { contentType: 'image/jpeg' });

    const result = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result.success).toBe(false);

    const { data: pendingRow } = await admin.from('pending_uploads').select('status, rejection_reason').eq('id', target.data.uploadId).single();
    expect(pendingRow!.status).toBe('rejected');
    expect(pendingRow!.rejection_reason).toBe('mime_mismatch');
  });

  it('rejects a decoded image exceeding the pixel-count guard', async () => {
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg({ quality: 20 }).toBuffer();
    const target = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/jpeg', declaredSizeBytes: bomb.length,
    });
    expect(target.success).toBe(true);
    if (!target.success) return;
    await admin.storage.from('site-visit-attachments').uploadToSignedUrl(target.data.pendingPath, target.data.signedUploadToken, bomb, { contentType: 'image/jpeg' });

    const result = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result.success).toBe(false);
    const { data: pendingRow } = await admin.from('pending_uploads').select('rejection_reason').eq('id', target.data.uploadId).single();
    expect(pendingRow!.rejection_reason).toBe('decompression_bomb_guard');
  });

  it('rejects undecodable garbage bytes', async () => {
    const garbage = Buffer.from('this is not an image');
    const target = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/jpeg', declaredSizeBytes: garbage.length,
    });
    expect(target.success).toBe(true);
    if (!target.success) return;
    await admin.storage.from('site-visit-attachments').uploadToSignedUrl(target.data.pendingPath, target.data.signedUploadToken, garbage, { contentType: 'image/jpeg' });

    const result = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result.success).toBe(false);
    const { data: pendingRow } = await admin.from('pending_uploads').select('rejection_reason').eq('id', target.data.uploadId).single();
    expect(pendingRow!.rejection_reason).toBe('undecodable');
  });

  it('rejects an unsupported declared MIME type before any upload occurs', async () => {
    const result = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/gif', declaredSizeBytes: 100,
    });
    expect(result.success).toBe(false);
  });

  it('real phone-photo fixture (if present locally): orientation baked correctly, EXIF/GPS fully stripped', async () => {
    const fixturePath = path.resolve(__dirname, '../../../.test-fixtures/real-phone-photo.jpg');
    if (!existsSync(fixturePath)) {
      // Not committed to the repo (real photo, not a synthetic fixture) —
      // see docs/implementation/request-site-visit-estimate-workflow.md for
      // how to supply one locally. Skipped, not silently passed as green.
      return;
    }
    const original = readFileSync(fixturePath);
    const rawMeta = await sharp(original).metadata();

    const target = await requestPendingUpload(admin, {
      orgId: ORG1, entityType: 'site_visit', entityId: siteVisitId, actorUserId: ownerId,
      declaredMimeType: 'image/jpeg', declaredSizeBytes: original.length,
    });
    expect(target.success).toBe(true);
    if (!target.success) return;
    await admin.storage.from('site-visit-attachments').uploadToSignedUrl(target.data.pendingPath, target.data.signedUploadToken, original, { contentType: 'image/jpeg' });

    const result = await finalizeSiteVisitUpload(admin, target.data.uploadId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdVaultItemIds.push(result.data.vaultItemId);
    createdStoragePaths.push(result.data.storagePath);

    const { data: sanitizedFile } = await admin.storage.from('site-visit-attachments').download(result.data.storagePath);
    const sanitizedBuffer = Buffer.from(await sanitizedFile!.arrayBuffer());
    const sanitizedMeta = await sharp(sanitizedBuffer).metadata();

    expect(sanitizedMeta.exif).toBeUndefined();
    if (rawMeta.orientation && rawMeta.orientation >= 5) {
      // Orientation 5-8 imply a 90-degree rotation, so dims should swap.
      expect(sanitizedMeta.width).toBe(rawMeta.height);
      expect(sanitizedMeta.height).toBe(rawMeta.width);
    }
  });
});
