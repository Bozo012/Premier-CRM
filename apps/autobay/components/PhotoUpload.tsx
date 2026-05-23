"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, X, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PhotoUploadFlow() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Uploading photos…");
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      const combined = [...photos, ...incoming].slice(0, 8);
      const newPreviews = combined.map((f) => URL.createObjectURL(f));
      // Revoke old object URLs to prevent leaks
      previews.forEach((url) => URL.revokeObjectURL(url));
      setPhotos(combined);
      setPreviews(newPreviews);
      if (combined.length === 8) {
        toast.info("Maximum 8 photos reached.");
      }
    },
    [photos, previews]
  );

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    const next = photos.filter((_, i) => i !== index);
    const nextPreviews = previews.filter((_, i) => i !== index);
    setPhotos(next);
    setPreviews(nextPreviews);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleGenerate = async () => {
    if (photos.length === 0) return;
    setLoading(true);

    const fd = new FormData();
    photos.forEach((f) => fd.append("photos", f));

    try {
      setLoadingMsg("Uploading photos…");
      await new Promise((r) => setTimeout(r, 300));
      setLoadingMsg("Analyzing with AI… this may take a minute.");

      const res = await fetch("/api/listings/generate", {
        method: "POST",
        body: fd,
      });
      const data = await res.json() as { listing?: { id: string }; usedMock?: boolean; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      if (data.usedMock) {
        toast.warning(
          "LM Studio not reachable — generated a mock draft. Start LM Studio and retry AI generation."
        );
      } else {
        toast.success("AI draft generated!");
      }

      router.push(`/listing/${data.listing!.id}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 hover:border-slate-400 bg-white",
          photos.length >= 8 && "opacity-50 pointer-events-none"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Camera size={40} className="mx-auto text-slate-400 mb-3" />
        <p className="font-medium text-slate-700 mb-1">
          {photos.length === 0
            ? "Tap to add photos"
            : `${photos.length}/8 photos added`}
        </p>
        <p className="text-sm text-slate-500">
          Up to 8 photos · JPG, PNG, WEBP
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Photo grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                aria-label="Remove photo"
              >
                <X size={10} className="text-white" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">
                  Main
                </span>
              )}
            </div>
          ))}
          {photos.length < 8 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-white"
            >
              <span className="text-2xl text-slate-400">+</span>
            </button>
          )}
        </div>
      )}

      {/* Tips */}
      {photos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Include photos of all sides, any defects, labels/tags, and serial
            numbers for the best AI analysis.
          </p>
        </div>
      )}

      {/* Generate button */}
      <button
        type="button"
        disabled={photos.length === 0 || loading}
        onClick={handleGenerate}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-xl py-4 font-semibold text-base transition-colors",
          photos.length === 0 || loading
            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
            : "bg-blue-600 text-white active:bg-blue-700"
        )}
      >
        {loading ? (
          <>
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {loadingMsg}
          </>
        ) : (
          <>
            <Sparkles size={20} />
            Generate Listing with AI
          </>
        )}
      </button>

      {photos.length === 0 && (
        <p className="text-center text-xs text-slate-400">
          Add at least 1 photo to continue
        </p>
      )}
    </div>
  );
}
