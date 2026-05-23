import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hydrateListing } from "@/lib/utils";

export async function GET() {
  const listings = await db.listing.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(listings.map(hydrateListing));
}
