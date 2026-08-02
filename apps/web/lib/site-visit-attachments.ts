/**
 * The trusted server-side finalization step for site-visit/estimate photo
 * uploads. This is the ONLY place in the app that imports `sharp` — see
 * apps/web/package.json (a runtime dependency here, deliberately not at
 * the workspace root, since this app is the only workspace that performs
 * image processing).
 *
 * MUST always be called with a service-role client (createServiceClient()),
 * never a user-session client — it is the trusted step that verifies actual
 * decoded image content and strips all metadata before anything permanent
 * is written. See docs/implementation/request-site-visit-estimate-workflow.md
 * §5-6 for the full design and the Checkpoint A/A.1 spike verification this
 * implementation is based on.
 */
import sharp, { type Metadata } from 'sharp';

import { ErrorCode, err, ok, type Result } from '@premier/shared';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_JPEG_QUALITY,
  MAX_DECODED_PIXELS,
  SITE_VISIT_ATTACHMENTS_BUCKET,
  getPendingUpload,
  insertFinalizedVaultItem,
  markPendingUploadFinalized,
  markPendingUploadRejected,
  type DbClient,
} from '@premier/db';

export interface FinalizedAttachment {
  vaultItemId: string;
  storagePath: string;
}

export async function finalizeSiteVisitUpload(serviceClient: DbClient, uploadId: string): Promise<Result<FinalizedAttachment>> {
  const pendingResult = await getPendingUpload(serviceClient, uploadId);
  if (!pendingResult.success) return pendingResult;
  const pending = pendingResult.data;
  if (!pending) return err(ErrorCode.NOT_FOUND, 'Pending upload not found.');

  if (pending.status === 'finalized') {
    if (!pending.finalized_vault_item_id) {
      return err(ErrorCode.DB_ERROR, 'Pending upload is marked finalized but has no linked vault item.');
    }
    return ok({ vaultItemId: pending.finalized_vault_item_id, storagePath: `${pending.org_id}/${pending.entity_type}/${pending.entity_id}/${uploadId}.jpg` });
  }
  if (pending.status !== 'pending') {
    return err(ErrorCode.VALIDATION_ERROR, `This upload is already ${pending.status} and cannot be finalized.`);
  }

  const { data: file, error: downloadError } = await serviceClient.storage
    .from(SITE_VISIT_ATTACHMENTS_BUCKET)
    .download(pending.pending_path);
  if (downloadError || !file) {
    await markPendingUploadRejected(serviceClient, uploadId, 'pending_object_missing');
    return err(ErrorCode.NOT_FOUND, 'The uploaded object could not be found in storage.');
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // Actual-content validation — never trust the declared MIME/extension alone.
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    await markPendingUploadRejected(serviceClient, uploadId, 'undecodable');
    return err(ErrorCode.VALIDATION_ERROR, 'The uploaded file could not be decoded as a valid image.');
  }

  const decodedMime = meta.format === 'jpeg' ? 'image/jpeg' : meta.format === 'png' ? 'image/png' : null;
  if (!decodedMime || !ALLOWED_ATTACHMENT_MIME_TYPES.has(decodedMime) || decodedMime !== pending.declared_mime_type) {
    await markPendingUploadRejected(serviceClient, uploadId, 'mime_mismatch');
    return err(ErrorCode.VALIDATION_ERROR, 'The file content does not match its declared type.');
  }

  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_DECODED_PIXELS) {
    await markPendingUploadRejected(serviceClient, uploadId, 'decompression_bomb_guard');
    return err(ErrorCode.VALIDATION_ERROR, 'The image dimensions are too large.');
  }

  if (meta.pages && meta.pages > 1) {
    await markPendingUploadRejected(serviceClient, uploadId, 'animated_unsupported');
    return err(ErrorCode.VALIDATION_ERROR, 'Animated images are not supported.');
  }

  // Auto-orient (bakes EXIF orientation into pixel data), re-encode as JPEG.
  // .withMetadata() is never called, so the output carries NO EXIF/GPS at all
  // — verified against a real phone photo in Checkpoint A.1 (orientation tag
  // 6, 4032x3024 -> processed 3024x4032, zero EXIF bytes remaining).
  const sanitized = await sharp(buffer).rotate().jpeg({ quality: ATTACHMENT_JPEG_QUALITY }).toBuffer();

  // Deterministic permanent path from uploadId — makes retries idempotent
  // (never a fresh random name per attempt).
  const permanentPath = `${pending.org_id}/${pending.entity_type}/${pending.entity_id}/${uploadId}.jpg`;

  const { error: uploadError } = await serviceClient.storage
    .from(SITE_VISIT_ATTACHMENTS_BUCKET)
    .upload(permanentPath, sanitized, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) return err(ErrorCode.DB_ERROR, `Failed to write the sanitized image: ${uploadError.message}`);

  const insertResult = await insertFinalizedVaultItem(serviceClient, {
    orgId: pending.org_id,
    entityType: pending.entity_type,
    entityId: pending.entity_id,
    storagePath: permanentPath,
    createdBy: pending.created_by,
  });
  if (!insertResult.success) {
    // DB insert failed and isn't a safe retry — remove the just-written
    // permanent object so no orphan is left behind.
    await serviceClient.storage.from(SITE_VISIT_ATTACHMENTS_BUCKET).remove([permanentPath]);
    return insertResult;
  }

  await markPendingUploadFinalized(serviceClient, uploadId, insertResult.data.id);
  await serviceClient.storage.from(SITE_VISIT_ATTACHMENTS_BUCKET).remove([pending.pending_path]);

  return ok({ vaultItemId: insertResult.data.id, storagePath: permanentPath });
}
