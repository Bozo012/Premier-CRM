/**
 * DB/Storage-only half of the private quarantine-then-finalize photo upload
 * architecture. This package has no `sharp` dependency by design (that's an
 * image-processing library, scoped only to the app workspace that actually
 * performs finalization — see apps/web/lib/site-visit-attachments.ts,
 * which imports the functions below plus `sharp` to implement
 * finalizeUpload()). Verified end-to-end in the Checkpoint A/A.1 spikes.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';

export const SITE_VISIT_ATTACHMENTS_BUCKET = 'site-visit-attachments';
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
export const MAX_DECLARED_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 30_000_000; // ~30MP decompression-bomb guard
export const ATTACHMENT_FILE_COUNT_CAP = 20;
export const ATTACHMENT_JPEG_QUALITY = 85;

export interface RequestPendingUploadInput {
  orgId: string;
  entityType: 'site_visit' | 'estimate' | 'job';
  entityId: string;
  actorUserId: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
}

export interface PendingUploadTarget {
  uploadId: string;
  pendingPath: string;
  signedUploadToken: string;
}

export interface PendingUploadRow {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  declared_mime_type: string;
  declared_size_bytes: number;
  pending_path: string;
  status: string;
  finalized_vault_item_id: string | null;
  created_by: string | null;
}

/**
 * Step 1 — request an authorized upload target. Called with the
 * authenticated user's own client so RLS enforces org membership; the
 * per-entity file-count cap and MIME/size checks happen here too, before a
 * signed URL is ever issued.
 */
export async function requestPendingUpload(
  client: DbClient,
  input: RequestPendingUploadInput
): Promise<Result<PendingUploadTarget>> {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(input.declaredMimeType)) {
    return err(ErrorCode.VALIDATION_ERROR, `Unsupported file type: ${input.declaredMimeType}. Only JPEG and PNG are accepted.`);
  }
  if (input.declaredSizeBytes > MAX_DECLARED_SIZE_BYTES) {
    return err(ErrorCode.VALIDATION_ERROR, 'File is too large. Maximum size is 15MB.');
  }

  // Verify the referenced entity actually belongs to the caller's org before
  // creating any pending_uploads row — entity_id has no FK constraint, and
  // nothing else in this path checks that the caller's own org (which RLS
  // already confirms they're a member of) matches the entity they're
  // attaching a photo to.
  const entityOrgQuery =
    input.entityType === 'site_visit'
      ? client.from('site_visits').select('id').eq('id', input.entityId).eq('org_id', input.orgId).maybeSingle()
      : input.entityType === 'job'
        ? client.from('jobs').select('id').eq('id', input.entityId).eq('org_id', input.orgId).maybeSingle()
        : client.from('estimates').select('id').eq('id', input.entityId).eq('org_id', input.orgId).maybeSingle();
  const { data: entityOwnership, error: entityOwnershipError } = await entityOrgQuery;
  if (entityOwnershipError) return err(ErrorCode.DB_ERROR, entityOwnershipError.message);
  if (!entityOwnership) return err(ErrorCode.NOT_FOUND, `${input.entityType.replace('_', ' ')} not found.`);

  const countQuery = client.from('vault_items').select('id', { count: 'exact', head: true }).eq('org_id', input.orgId);
  const { count, error: countError } =
    input.entityType === 'site_visit'
      ? await countQuery.eq('site_visit_id', input.entityId)
      : input.entityType === 'job'
        ? await countQuery.eq('job_id', input.entityId)
        : await countQuery.eq('estimate_id', input.entityId);
  if (countError) return err(ErrorCode.DB_ERROR, countError.message);
  if ((count ?? 0) >= ATTACHMENT_FILE_COUNT_CAP) {
    return err(ErrorCode.VALIDATION_ERROR, `This ${input.entityType.replace('_', ' ')} already has the maximum of ${ATTACHMENT_FILE_COUNT_CAP} photos.`);
  }

  const uploadId = crypto.randomUUID();
  const pendingPath = `${input.orgId}/pending/${uploadId}`;

  const { error: insertError } = await client.from('pending_uploads').insert({
    id: uploadId,
    org_id: input.orgId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    declared_mime_type: input.declaredMimeType,
    declared_size_bytes: input.declaredSizeBytes,
    pending_path: pendingPath,
    created_by: input.actorUserId,
  });
  if (insertError) return err(ErrorCode.VALIDATION_ERROR, insertError.message);

  const { data: signed, error: signError } = await client.storage
    .from(SITE_VISIT_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(pendingPath);
  if (signError || !signed) return err(ErrorCode.DB_ERROR, signError?.message ?? 'Failed to create signed upload URL.');

  return ok({ uploadId, pendingPath, signedUploadToken: signed.token });
}

/** Fetches a pending_uploads row by id — used by finalizeUpload() in apps/web. */
export async function getPendingUpload(serviceClient: DbClient, uploadId: string): Promise<Result<PendingUploadRow | null>> {
  const { data, error } = await serviceClient.from('pending_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(data as PendingUploadRow | null);
}

export async function markPendingUploadRejected(serviceClient: DbClient, uploadId: string, reason: string): Promise<void> {
  await serviceClient.from('pending_uploads').update({ status: 'rejected', rejection_reason: reason }).eq('id', uploadId);
}

export interface FinalizedVaultItemInput {
  orgId: string;
  entityType: string;
  entityId: string;
  storagePath: string;
  createdBy: string | null;
}

/** Inserts (idempotently, keyed by storage_object_key) the permanent vault_items row. */
export async function insertFinalizedVaultItem(
  serviceClient: DbClient,
  input: FinalizedVaultItemInput
): Promise<Result<{ id: string }>> {
  const { data, error } = await serviceClient
    .from('vault_items')
    .upsert(
      {
        org_id: input.orgId,
        type: 'photo',
        source: 'manual_upload',
        content: `Site-visit attachment (${input.entityType})`,
        storage_object_key: input.storagePath,
        image_url: input.storagePath,
        site_visit_id: input.entityType === 'site_visit' ? input.entityId : null,
        estimate_id: input.entityType === 'estimate' ? input.entityId : null,
        job_id: input.entityType === 'job' ? input.entityId : null,
        created_by: input.createdBy,
      },
      { onConflict: 'storage_object_key' }
    )
    .select('id')
    .maybeSingle();
  if (error || !data) return err(ErrorCode.DB_ERROR, error?.message ?? 'Failed to record the finalized attachment.');
  return ok(data);
}

export async function markPendingUploadFinalized(serviceClient: DbClient, uploadId: string, vaultItemId: string): Promise<void> {
  await serviceClient.from('pending_uploads').update({ status: 'finalized', finalized_vault_item_id: vaultItemId }).eq('id', uploadId);
}

/** Signed, time-limited read access for staff — never a public URL. */
export async function getSignedReadUrl(client: DbClient, storagePath: string, expiresInSeconds = 300): Promise<Result<string>> {
  const { data, error } = await client.storage.from(SITE_VISIT_ATTACHMENTS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) return err(ErrorCode.DB_ERROR, error?.message ?? 'Failed to create signed read URL.');
  return ok(data.signedUrl);
}

/**
 * Customer-Safe Photo Visibility (docs/implementation/customer-safe-photo-
 * visibility-design.md, PR #141). publish/unpublish are SECURITY DEFINER
 * RPCs (20260811030000_customer_safe_photo_visibility.sql) — org/role are
 * derived server-side from the caller's session, never accepted as a
 * parameter here. Call with the user's own session client (never
 * service-role) so the RPC's canPublishCustomerMedia check runs against the
 * real caller, not an elevated bypass.
 */
export interface PublishedPhoto {
  id: string;
  customerVisible: boolean;
}

export async function publishCustomerVisiblePhoto(client: DbClient, vaultItemId: string): Promise<Result<PublishedPhoto>> {
  const { data, error } = await client.rpc('publish_customer_visible_photo', { p_vault_item_id: vaultItemId });
  if (error || !data) return err(ErrorCode.VALIDATION_ERROR, error?.message ?? 'Failed to publish photo.');
  return ok({ id: data.id, customerVisible: data.customer_visible });
}

export async function unpublishCustomerVisiblePhoto(client: DbClient, vaultItemId: string): Promise<Result<PublishedPhoto>> {
  const { data, error } = await client.rpc('unpublish_customer_visible_photo', { p_vault_item_id: vaultItemId });
  if (error || !data) return err(ErrorCode.VALIDATION_ERROR, error?.message ?? 'Failed to unpublish photo.');
  return ok({ id: data.id, customerVisible: data.customer_visible });
}

/**
 * The ONE centralized customer read path (`list_customer_visible_photos`).
 * Call with the user's own session client — the RPC proves ownership via
 * auth.uid() against customer_accounts, plus explicit customer_visible=true,
 * in a single WHERE clause. Pass exactly one of jobId/estimateId/siteVisitId;
 * the RPC itself never trusts a bare vault_item id. The siteVisitId branch
 * (20260811040000_site_visit_customer_photo_visibility.sql) proves ownership
 * via site_visits -> service_requests -> customer_accounts, since site_visits
 * carries no customer_id of its own.
 */
export interface CustomerVisiblePhoto {
  id: string;
  storagePath: string | null;
  caption: string;
  createdAt: string;
}

export async function listCustomerVisiblePhotosForJob(client: DbClient, jobId: string): Promise<Result<CustomerVisiblePhoto[]>> {
  const { data, error } = await client.rpc('list_customer_visible_photos', { p_job_id: jobId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(mapCustomerVisiblePhotoRows(data));
}

export async function listCustomerVisiblePhotosForEstimate(client: DbClient, estimateId: string): Promise<Result<CustomerVisiblePhoto[]>> {
  const { data, error } = await client.rpc('list_customer_visible_photos', { p_estimate_id: estimateId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(mapCustomerVisiblePhotoRows(data));
}

export async function listCustomerVisiblePhotosForSiteVisit(client: DbClient, siteVisitId: string): Promise<Result<CustomerVisiblePhoto[]>> {
  const { data, error } = await client.rpc('list_customer_visible_photos', { p_site_visit_id: siteVisitId });
  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(mapCustomerVisiblePhotoRows(data));
}

function mapCustomerVisiblePhotoRows(
  data: Array<{ id: string; storage_object_key: string | null; image_url: string | null; caption: string | null; created_at: string }> | null
): CustomerVisiblePhoto[] {
  return (data ?? []).map((row) => ({
    id: row.id,
    storagePath: row.storage_object_key ?? row.image_url,
    caption: row.caption?.trim() || 'Photo',
    createdAt: row.created_at,
  }));
}
