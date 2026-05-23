import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hydrateListing } from "@/lib/utils";
import { deleteListingPhotos } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(hydrateListing(listing));
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  // Serialize JSON fields back to strings for SQLite
  const data: Record<string, unknown> = { ...body };
  for (const key of ["itemSpecifics", "visibleDefects", "cannotVerify", "questions", "keywords", "photos"]) {
    if (key in data && typeof data[key] !== "string") {
      data[key] = JSON.stringify(data[key]);
    }
  }

  try {
    const updated = await db.listing.update({ where: { id }, data });
    return NextResponse.json(hydrateListing(updated));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    await db.listing.delete({ where: { id } });
    await deleteListingPhotos(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
