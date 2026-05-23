import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Listing } from "@prisma/client";
import type { HydratedListing } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function hydrateListing(listing: Listing): HydratedListing {
  return {
    ...listing,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    ebayPublishedAt: listing.ebayPublishedAt?.toISOString() ?? null,
    status: listing.status as HydratedListing["status"],
    photos: safeParseJson<string[]>(listing.photos, []),
    aiRaw: safeParseJson(listing.aiRaw, null),
    itemSpecifics: safeParseJson<Record<string, string>>(
      listing.itemSpecifics,
      {}
    ),
    visibleDefects: safeParseJson<string[]>(listing.visibleDefects, []),
    cannotVerify: safeParseJson<string[]>(listing.cannotVerify, []),
    questions: safeParseJson<string[]>(listing.questions, []),
    keywords: safeParseJson<string[]>(listing.keywords, []),
  };
}

export function formatPrice(low: number | null, high: number | null): string {
  if (!low && !high) return "—";
  if (low && high)
    return `$${low.toFixed(0)}–$${high.toFixed(0)}`;
  if (low) return `From $${low.toFixed(0)}`;
  return `Up to $${high!.toFixed(0)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
