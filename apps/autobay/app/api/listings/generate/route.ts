// POST /api/listings/generate
// Accepts multipart/form-data with up to 8 photos.
// Creates a listing, saves photos, calls AI, returns the listing.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savePhotos } from "@/lib/storage";
import { generateListingDraft, mockListingDraft } from "@/lib/ai";
import { hydrateListing } from "@/lib/utils";

export const maxDuration = 120; // 2-minute timeout for LLM generation

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 }
    );
  }

  const files = formData.getAll("photos") as File[];
  const validFiles = files.filter(
    (f) => f instanceof File && f.size > 0
  );

  if (validFiles.length === 0) {
    return NextResponse.json(
      { error: "Please upload at least one photo." },
      { status: 400 }
    );
  }
  if (validFiles.length > 8) {
    return NextResponse.json(
      { error: "Maximum 8 photos allowed." },
      { status: 400 }
    );
  }

  // Create listing record first
  const listing = await db.listing.create({
    data: { status: "generating", photos: "[]" },
  });

  // Save photos to disk
  let photoPaths: string[];
  try {
    photoPaths = await savePhotos(validFiles, listing.id);
  } catch (err) {
    await db.listing.delete({ where: { id: listing.id } });
    console.error("Photo save error:", err);
    return NextResponse.json(
      { error: "Failed to save photos." },
      { status: 500 }
    );
  }

  await db.listing.update({
    where: { id: listing.id },
    data: { photos: JSON.stringify(photoPaths) },
  });

  // Generate AI draft (falls back to mock on error)
  let aiDraft;
  let usedMock = false;

  try {
    aiDraft = await generateListingDraft(photoPaths);
  } catch (err) {
    console.error("AI generation error:", err);
    aiDraft = mockListingDraft(photoPaths.length);
    usedMock = true;
  }

  // Persist AI output
  const updated = await db.listing.update({
    where: { id: listing.id },
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

  return NextResponse.json({
    listing: hydrateListing(updated),
    usedMock,
  });
}
