import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { hydrateListing } from "@/lib/utils";
import { ListingCard } from "@/components/ListingCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rawListings = await db.listing.findMany({
    orderBy: { createdAt: "desc" },
  });
  const listings = rawListings.map(hydrateListing);

  const stats = {
    total: listings.length,
    draft: listings.filter((l) =>
      ["draft", "generating"].includes(l.status)
    ).length,
    reviewing: listings.filter((l) => l.status === "reviewing").length,
    ready: listings.filter((l) => l.status === "ready").length,
    published: listings.filter((l) => l.status === "published_mock").length,
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Tag size={16} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900">AutoBay Lister</span>
        </div>
        <Link
          href="/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg active:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Listing
        </Link>
      </header>

      <main className="flex-1 px-4 py-4">
        {listings.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              <StatChip label="Total" value={stats.total} color="slate" />
              <StatChip label="Draft" value={stats.draft} color="amber" />
              <StatChip label="Review" value={stats.reviewing} color="blue" />
              <StatChip label="Done" value={stats.published} color="green" />
            </div>

            {/* Listing grid */}
            <div className="space-y-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "slate" | "amber" | "blue" | "green";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <div
      className={`rounded-lg px-2 py-2 text-center ${colors[color]}`}
    >
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="text-xs mt-0.5 font-medium opacity-75">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <Tag size={32} className="text-blue-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">
        No listings yet
      </h2>
      <p className="text-slate-500 text-sm mb-6 max-w-xs">
        Upload photos of an item and AI will generate an eBay listing draft for
        you to review.
      </p>
      <Link
        href="/new"
        className="flex items-center gap-2 bg-blue-600 text-white font-medium px-5 py-3 rounded-xl active:bg-blue-700 transition-colors"
      >
        <Plus size={18} />
        Create your first listing
      </Link>
    </div>
  );
}
