import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { hydrateListing } from "@/lib/utils";
import { ListingEditor } from "@/components/ListingEditor";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;

  const raw = await db.listing.findUnique({ where: { id } });
  if (!raw) notFound();

  const listing = hydrateListing(raw);

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors -ml-1"
        >
          <ChevronLeft size={22} className="text-slate-700" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-slate-900 truncate">
            {listing.shortTitle ?? listing.title ?? "Draft Listing"}
          </h1>
        </div>
        <StatusBadge status={listing.status} />
      </header>

      <main className="flex-1">
        <ListingEditor listing={listing} />
      </main>
    </div>
  );
}
