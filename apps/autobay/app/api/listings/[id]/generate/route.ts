// POST /api/listings/[id]/generate
// Re-generates AI draft for an existing listing (retry without re-uploading photos).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateListingDraft, mockListingDraft } from "@/lib/ai";
import { hydrateListing } from "@/lib/utils";

export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;

  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photoPaths: string[] = JSON.parse(listing.photos || "[]");
  if (photoPaths.length === 0)
    return NextResponse.json(
      { error: "No photos to analyze." },
      { status: 400 }
    );

  await db.listing.update({
    where: { id },
    data: { status: "generating" },
  });

  let aiDraft;
  let usedMock = false;

  try {
    aiDraft = await generateListingDraft(photoPaths);
  } catch (err) {
    console.error("AI regeneration error:", err);
    aiDraft = mockListingDraft(photoPaths.length);
    usedMock = true;
  }

  const updated = await db.listing.update({
    where: { id },
    data: {
      status: "reviewing",
      aiRaw: JSON.stringify(aiDraft),
      title: aiDraft.title,
      shortTitle: aiDraft.short_title,
      categoryGuess: aiDraft.category_guess,
      condition: aiDraft.condition_guess,
      description: aiDraft.description,
      itemSpecifics: JSON.stringify(aiDraft.item_specifics),
      visibleDefects: JSON.stringify(aiDraft.visible_defects),
      cannotVerify: JSON.stringify(aiDraft.what_cannot_be_verified),
      priceLow: aiDraft.suggested_price_range.low,
      priceHigh: aiDraft.suggested_price_range.high,
      priceReasoning: aiDraft.suggested_price_range.reasoning,
      shipping: aiDraft.shipping_recommendation,
      confidence: aiDraft.confidence_score,
      questions: JSON.stringify(aiDraft.questions_for_user),
      keywords: JSON.stringify(aiDraft.search_keywords),
    },
  });

  return NextResponse.json({ listing: hydrateListing(updated), usedMock });
}
