'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { SITE_VISIT_ATTACHMENTS_BUCKET } from '@premier/db';

import { getBrowserSupabase } from '@/lib/supabase';

import { requestJobPhotoUploadAction, finalizeJobPhotoUploadAction } from '../actions';

export function AddJobPhotoForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const targetResult = await requestJobPhotoUploadAction({
        jobId,
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

      const finalizeResult = await finalizeJobPhotoUploadAction(uploadId, jobId);
      if (!finalizeResult.success) {
        toast.error(finalizeResult.error ?? 'Failed to process photo.');
        return;
      }

      toast.success('Photo added.');
      router.refresh();
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
      />
      {isUploading ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
      <p className="text-xs text-muted-foreground">JPEG or PNG, up to 15MB. Internal only until a staff member explicitly publishes it to the customer portal.</p>
    </div>
  );
}
