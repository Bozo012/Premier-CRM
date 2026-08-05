'use client';

// Client component: needs file input + direct-to-Storage upload via the
// browser Supabase client (signed URL issued by the trusted server action).
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { SITE_VISIT_ATTACHMENTS_BUCKET } from '@premier/db';

import { getBrowserSupabase } from '@/lib/supabase';

import { requestSiteVisitPhotoUploadAction, finalizeSiteVisitPhotoUploadAction } from '../actions';

interface PhotoUploadProps {
  siteVisitId: string;
  onUploaded: (vaultItemId: string) => void;
  disabled?: boolean;
}

export function PhotoUpload({ siteVisitId, onUploaded, disabled }: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Uploads one file through the existing request→PUT→finalize contract.
  // Returns whether it succeeded so the caller can retry just this file
  // (by re-selecting it) without resubmitting the whole batch.
  const uploadOne = async (file: File): Promise<boolean> => {
    const targetResult = await requestSiteVisitPhotoUploadAction({
      siteVisitId,
      entityType: 'site_visit',
      declaredMimeType: file.type,
      declaredSizeBytes: file.size,
    });
    if (!targetResult.success) {
      toast.error(`${file.name}: ${targetResult.error ?? 'Failed to start upload.'}`);
      return false;
    }

    const supabase = getBrowserSupabase();
    const { uploadId, pendingPath, signedUploadToken } = targetResult.data;
    const { error: uploadError } = await supabase.storage
      .from(SITE_VISIT_ATTACHMENTS_BUCKET)
      .uploadToSignedUrl(pendingPath, signedUploadToken, file, { contentType: file.type });
    if (uploadError) {
      toast.error(`${file.name}: upload failed — ${uploadError.message}`);
      return false;
    }

    const finalizeResult = await finalizeSiteVisitPhotoUploadAction(uploadId);
    if (!finalizeResult.success) {
      toast.error(`${file.name}: ${finalizeResult.error ?? 'Failed to process photo.'}`);
      return false;
    }

    onUploaded(finalizeResult.data.vaultItemId);
    return true;
  };

  const handleFiles = async (files: File[]) => {
    setIsUploading(true);
    setProgress({ done: 0, total: files.length });
    let succeeded = 0;
    try {
      // Sequential, not parallel: each upload needs its own signed URL from
      // the trusted server action, and the underlying storage bucket/action
      // contract was not built or verified for concurrent calls.
      for (const file of files) {
        const ok = await uploadOne(file);
        if (ok) succeeded += 1;
        setProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }

    if (succeeded === files.length) {
      toast.success(files.length === 1 ? 'Photo uploaded.' : `${succeeded} photos uploaded.`);
    } else if (succeeded > 0) {
      toast.error(`${succeeded} of ${files.length} photos uploaded — reselect the failed one(s) to retry.`);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        multiple
        disabled={disabled || isUploading}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleFiles(files);
        }}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
      />
      {progress ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Uploading {progress.done + 1} of {progress.total}…
        </p>
      ) : null}
    </div>
  );
}
