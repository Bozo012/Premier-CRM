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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const targetResult = await requestSiteVisitPhotoUploadAction({
        siteVisitId,
        entityType: 'site_visit',
        declaredMimeType: file.type,
        declaredSizeBytes: file.size,
      });
      if (!targetResult.success) {
        toast.error(targetResult.error ?? 'Failed to start upload.');
        return;
      }

      const supabase = getBrowserSupabase();
      const { uploadId, pendingPath, signedUploadToken } = targetResult.data;
      const { error: uploadError } = await supabase.storage
        .from(SITE_VISIT_ATTACHMENTS_BUCKET)
        .uploadToSignedUrl(pendingPath, signedUploadToken, file, { contentType: file.type });
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      const finalizeResult = await finalizeSiteVisitPhotoUploadAction(uploadId);
      if (!finalizeResult.success) {
        toast.error(finalizeResult.error ?? 'Failed to process photo.');
        return;
      }

      toast.success('Photo uploaded.');
      onUploaded(finalizeResult.data.vaultItemId);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        disabled={disabled || isUploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
      />
      {isUploading ? <p className="mt-1 text-xs text-muted-foreground">Uploading…</p> : null}
    </div>
  );
}
