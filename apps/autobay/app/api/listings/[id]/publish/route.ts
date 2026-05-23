// POST /api/listings/[id]/publish
// Mock eBay draft creation. Marks listing as published_mock.
// TODO: swap mockPublishToEbay for real publishToEbay when credentials are ready.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mockPublishToEbay } from "@/lib/ebay";
import { hydrateListing } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;

  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!listing.title) {
    return NextResponse.json(
      { error: "Listing must have a title before publishing." },
      { status: 400 }
    );
  }

  const hydrated = hydrateListing(listing);
  const result = await mockPublishToEbay(hydrated);

  const updated = await db.listing.update({
    where: { id },
    data: {
      status: "published_mock",
      ebayListingId: result.listingId,
      ebayMockUrl: result.url,
      ebayPublishedAt: new Date(result.publishedAt),
    },
  });

  return NextResponse.json({
    listing: hydrateListing(updated),
    ebay: result,
  });
}
