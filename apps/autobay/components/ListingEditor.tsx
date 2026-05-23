"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  Save,
  ExternalLink,
  AlertTriangle,
  HelpCircle,
  Tag,
} from "lucide-react";
import type { HydratedListing } from "@/lib/types";
import { CONDITION_OPTIONS } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { StatusBadge } from "./StatusBadge";

const listingSchema = z.object({
  title: z.string().min(1, "Title is required").max(80, "Max 80 characters"),
  shortTitle: z.string().max(40).optional(),
  categoryGuess: z.string().optional(),
  condition: z.string().min(1, "Condition is required"),
  description: z.string().optional(),
  priceLow: z.coerce.number().min(0).optional(),
  priceHigh: z.coerce.number().min(0).optional(),
  shipping: z.string().optional(),
  itemSpecifics: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
  visibleDefects: z.array(z.object({ value: z.string() })).optional(),
});

type FormValues = z.infer<typeof listingSchema>;

function toFieldArray(obj: Record<string, string> | null) {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}

function fromFieldArray(arr: { key: string; value: string }[]) {
  return Object.fromEntries(arr.filter((i) => i.key).map((i) => [i.key, i.value]));
}

export function ListingEditor({ listing }: { listing: HydratedListing }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    url: string;
    listingId: string;
  } | null>(
    listing.ebayMockUrl
      ? { url: listing.ebayMockUrl, listingId: listing.ebayListingId ?? "" }
      : null
  );

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: listing.title ?? "",
      shortTitle: listing.shortTitle ?? "",
      categoryGuess: listing.categoryGuess ?? "",
      condition: listing.condition ?? "Good",
      description: listing.description ?? "",
      priceLow: listing.priceLow ?? undefined,
      priceHigh: listing.priceHigh ?? undefined,
      shipping: listing.shipping ?? "",
      itemSpecifics: toFieldArray(listing.itemSpecifics),
      visibleDefects: (listing.visibleDefects ?? []).map((v) => ({ value: v })),
    },
  });

  const {
    fields: specificsFields,
    append: appendSpecific,
    remove: removeSpecific,
  } = useFieldArray({ control, name: "itemSpecifics" });

  const {
    fields: defectFields,
    append: appendDefect,
    remove: removeDefect,
  } = useFieldArray({ control, name: "visibleDefects" });

  const onSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          shortTitle: values.shortTitle,
          categoryGuess: values.categoryGuess,
          condition: values.condition,
          description: values.description,
          priceLow: values.priceLow,
          priceHigh: values.priceHigh,
          shipping: values.shipping,
          itemSpecifics: fromFieldArray(values.itemSpecifics ?? []),
          visibleDefects: (values.visibleDefects ?? []).map((d) => d.value),
          status: listing.status === "reviewing" ? "ready" : listing.status,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Draft saved");
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/publish`, {
        method: "POST",
      });
      const data = await res.json() as { ebay?: { url: string; listingId: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setPublishResult({ url: data.ebay!.url, listingId: data.ebay!.listingId });
      toast.success("Published to eBay (mock)!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const onRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/generate`, {
        method: "POST",
      });
      const data = await res.json() as { usedMock?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
      if (data.usedMock) {
        toast.warning("LM Studio not reachable — using mock.");
      } else {
        toast.success("AI draft regenerated!");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this listing?")) return;
    await fetch(`/api/listings/${listing.id}`, { method: "DELETE" });
    router.push("/");
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="pb-32">
      {/* Photo carousel */}
      {listing.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 snap-x">
          {listing.photos.map((src, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-56 h-56 rounded-xl overflow-hidden bg-slate-100 snap-start"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* AI meta row */}
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
        <ConfidenceBadge score={listing.confidence} />
        <StatusBadge status={listing.status} />
        {listing.priceReasoning && (
          <span className="text-xs text-slate-500 italic truncate max-w-xs">
            {listing.priceReasoning}
          </span>
        )}
      </div>

      {/* Published banner */}
      {publishResult && (
        <div className="mx-4 mb-3 bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-2">
          <Tag size={16} className="text-purple-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-900">
              Mock eBay Draft Created
            </p>
            <p className="text-xs text-purple-600 truncate">
              {publishResult.listingId}
            </p>
          </div>
          <a
            href={publishResult.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <ExternalLink size={16} className="text-purple-600" />
          </a>
        </div>
      )}

      {/* Questions for user */}
      {(listing.questions ?? []).length > 0 && (
        <div className="mx-4 mb-3 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            onClick={() => setShowQuestions(!showQuestions)}
          >
            <HelpCircle size={15} className="text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-900 flex-1">
              AI has questions ({listing.questions!.length})
            </span>
            {showQuestions ? (
              <ChevronUp size={15} className="text-blue-600" />
            ) : (
              <ChevronDown size={15} className="text-blue-600" />
            )}
          </button>
          {showQuestions && (
            <ul className="px-3 pb-3 space-y-1">
              {listing.questions!.map((q, i) => (
                <li key={i} className="text-xs text-blue-800 flex gap-1.5">
                  <span className="mt-0.5">•</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="px-4 space-y-5">
        {/* Title */}
        <Field label="Listing Title" error={errors.title?.message}>
          <div className="relative">
            <input
              {...register("title")}
              maxLength={80}
              className={inputClass(!!errors.title)}
              placeholder="eBay listing title (max 80 chars)"
            />
          </div>
        </Field>

        {/* Short title */}
        <Field label="Short Title (for display)">
          <input
            {...register("shortTitle")}
            maxLength={40}
            className={inputClass(false)}
            placeholder="Brief name"
          />
        </Field>

        {/* Category + Condition row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input
              {...register("categoryGuess")}
              className={inputClass(false)}
              placeholder="eBay category"
            />
          </Field>
          <Field label="Condition" error={errors.condition?.message}>
            <select
              {...register("condition")}
              className={inputClass(!!errors.condition)}
            >
              {CONDITION_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Price range */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Price Range (USD)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                $
              </span>
              <input
                {...register("priceLow")}
                type="number"
                step="0.01"
                min="0"
                className={cn(inputClass(false), "pl-7")}
                placeholder="Low"
              />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                $
              </span>
              <input
                {...register("priceHigh")}
                type="number"
                step="0.01"
                min="0"
                className={cn(inputClass(false), "pl-7")}
                placeholder="High"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <Field label="Description">
          <textarea
            {...register("description")}
            rows={5}
            className={cn(inputClass(false), "resize-none")}
            placeholder="Full item description for eBay listing"
          />
        </Field>

        {/* Shipping */}
        <Field label="Shipping Recommendation">
          <input
            {...register("shipping")}
            className={inputClass(false)}
            placeholder="e.g. USPS Priority Mail"
          />
        </Field>

        {/* Item Specifics */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">
              Item Specifics
            </label>
            <button
              type="button"
              onClick={() => appendSpecific({ key: "", value: "" })}
              className="text-xs text-blue-600 flex items-center gap-1"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {specificsFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`itemSpecifics.${i}.key`)}
                  className={cn(inputClass(false), "flex-1 text-sm")}
                  placeholder="Key"
                />
                <input
                  {...register(`itemSpecifics.${i}.value`)}
                  className={cn(
                    inputClass(false),
                    "flex-1 text-sm",
                    field.value === "uncertain"
                      ? "text-amber-700 bg-amber-50 border-amber-300"
                      : ""
                  )}
                  placeholder="Value"
                />
                <button
                  type="button"
                  onClick={() => removeSpecific(i)}
                  className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {specificsFields.length === 0 && (
              <p className="text-xs text-slate-400 italic">No item specifics</p>
            )}
          </div>
        </div>

        {/* Visible Defects */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" />
              Visible Defects
            </label>
            <button
              type="button"
              onClick={() => appendDefect({ value: "" })}
              className="text-xs text-blue-600 flex items-center gap-1"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {defectFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`visibleDefects.${i}.value`)}
                  className={cn(inputClass(false), "flex-1 text-sm")}
                  placeholder="Describe defect"
                />
                <button
                  type="button"
                  onClick={() => removeDefect(i)}
                  className="w-9 h-10 flex items-center justify-center text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {defectFields.length === 0 && (
              <p className="text-xs text-green-600 italic">
                No defects noted by AI
              </p>
            )}
          </div>
        </div>

        {/* Cannot Verify */}
        {(listing.cannotVerify ?? []).length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Cannot be verified from photos
            </p>
            <ul className="space-y-0.5">
              {listing.cannotVerify!.map((item, i) => (
                <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                  <span className="mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Search Keywords */}
        {(listing.keywords ?? []).length > 0 && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-slate-700 mb-2"
              onClick={() => setShowKeywords(!showKeywords)}
            >
              Search Keywords
              {showKeywords ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            {showKeywords && (
              <div className="flex flex-wrap gap-1.5">
                {listing.keywords!.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          Created {formatDate(listing.createdAt)}
        </p>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-slate-200 px-4 py-3 safe-bottom">
        <div className="flex gap-2">
          {/* Regenerate */}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            title="Re-run AI analysis"
            className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 active:bg-slate-100 disabled:opacity-40"
          >
            <RefreshCw
              size={18}
              className={cn(regenerating && "animate-spin")}
            />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={onDelete}
            title="Delete listing"
            className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-200 text-red-500 active:bg-red-50"
          >
            <Trash2 size={18} />
          </button>

          {/* Save */}
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm active:bg-slate-50 disabled:opacity-40"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Draft
          </button>

          {/* Publish */}
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing || listing.status === "published_mock"}
            className="flex-1 h-11 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white font-medium text-sm active:bg-blue-700 disabled:opacity-40"
          >
            {publishing ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {listing.status === "published_mock" ? "Published" : "Publish (Mock)"}
          </button>
        </div>
      </div>
    </form>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow",
    hasError
      ? "border-red-300 focus:ring-red-500"
      : "border-slate-300"
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
