import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { HydratedListing } from "@/lib/types";
import { formatPrice, formatDate } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function ListingCard({ listing }: { listing: HydratedListing }) {
  const firstPhoto = listing.photos[0];

  return (
    <Link href={`/listing/${listing.id}`}>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex gap-3 p-3 active:bg-slate-50 transition-colors">
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {firstPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firstPhoto}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageOff size={24} className="text-slate-300" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="font-medium text-slate-900 text-sm leading-snug line-clamp-2">
                {listing.shortTitle ?? listing.title ?? "Untitled"}
              </p>
              <StatusBadge status={listing.status} className="flex-shrink-0" />
            </div>
            {listing.categoryGuess && (
              <p className="text-xs text-slate-500 truncate">
                {listing.categoryGuess}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {formatPrice(listing.priceLow, listing.priceHigh)}
              </span>
              {listing.photos.length > 1 && (
                <span className="text-xs text-slate-400">
                  {listing.photos.length} photos
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ConfidenceBadge score={listing.confidence} />
              <span className="text-xs text-slate-400">
                {formatDate(listing.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
