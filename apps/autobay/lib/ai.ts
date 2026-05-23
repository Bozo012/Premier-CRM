import OpenAI from "openai";
import type { AIListingDraft } from "./types";
import { readPhotoAsBase64 } from "./storage";

const SYSTEM_PROMPT = `You are an expert eBay listing analyst. You analyze photos of items and generate accurate, honest eBay listing data.

CRITICAL RULES — NEVER violate these:
1. NEVER invent or assume facts not clearly visible in the provided photos.
2. If brand, model, size, authenticity, working status, or condition cannot be confirmed from photos, use the string "uncertain" for that field.
3. Note ALL visible defects, scratches, stains, damage — even minor ones. Honesty protects sellers.
4. Use conservative condition ratings. When in doubt, rate lower.
5. Do not guess a specific brand unless you can clearly READ it in the photos.
6. Price based on typical eBay completed-listing prices for a similar item in this condition.
7. Respond with ONLY valid JSON — no markdown fences, no explanation, no extra text.

Output schema (all fields required):
{
  "title": "string — eBay listing title, max 80 characters",
  "short_title": "string — brief display name, max 40 characters",
  "category_guess": "string — eBay category name",
  "condition_guess": "New|Like New|Very Good|Good|Acceptable|For Parts or Not Working",
  "description": "string — full eBay item description, plain text or simple HTML",
  "item_specifics": { "key": "value or 'uncertain'" },
  "visible_defects": ["string — specific defect description"],
  "what_cannot_be_verified": ["string — things needing physical inspection"],
  "suggested_price_range": {
    "low": number,
    "high": number,
    "reasoning": "string — brief explanation"
  },
  "shipping_recommendation": "string — carrier + service recommendation",
  "confidence_score": number_0_to_1,
  "questions_for_user": ["string — clarifying questions"],
  "search_keywords": ["string — max 10 eBay search keywords"]
}`;

function getClient(): OpenAI {
  const baseURL =
    process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const apiKey = process.env.LM_STUDIO_API_KEY ?? "lm-studio";
  return new OpenAI({ baseURL, apiKey });
}

function extractJson(text: string): string {
  // Strip markdown code fences if the model added them
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Find the outermost JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text.trim();
}

export async function generateListingDraft(
  photoPaths: string[]
): Promise<AIListingDraft> {
  const client = getClient();
  const model = process.env.LM_STUDIO_MODEL ?? "local-model";

  // Build vision content — include all photos as base64 image_url blocks
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" | "low" | "auto" } };

  const content: ContentPart[] = [
    {
      type: "text",
      text: `Analyze the ${photoPaths.length} photo(s) of this item and generate an eBay listing. Follow the system instructions exactly.`,
    },
  ];

  for (const photoPath of photoPaths) {
    try {
      const base64 = await readPhotoAsBase64(photoPath);
      content.push({
        type: "image_url",
        image_url: { url: base64, detail: "high" },
      });
    } catch (err) {
      console.error(`Failed to read photo ${photoPath}:`, err);
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const rawText = response.choices[0]?.message?.content ?? "";
  const jsonStr = extractJson(rawText);

  let parsed: AIListingDraft;
  try {
    parsed = JSON.parse(jsonStr) as AIListingDraft;
  } catch {
    throw new Error(
      `AI returned invalid JSON. Raw response: ${rawText.slice(0, 500)}`
    );
  }

  // Validate required fields exist (lenient — fill defaults if missing)
  return {
    title: parsed.title ?? "Untitled Item",
    short_title: parsed.short_title ?? parsed.title ?? "Untitled Item",
    category_guess: parsed.category_guess ?? "Everything Else",
    condition_guess: parsed.condition_guess ?? "Good",
    description: parsed.description ?? "",
    item_specifics: parsed.item_specifics ?? {},
    visible_defects: parsed.visible_defects ?? [],
    what_cannot_be_verified: parsed.what_cannot_be_verified ?? [],
    suggested_price_range: parsed.suggested_price_range ?? {
      low: 0,
      high: 0,
      reasoning: "Unable to estimate",
    },
    shipping_recommendation: parsed.shipping_recommendation ?? "",
    confidence_score:
      typeof parsed.confidence_score === "number"
        ? Math.min(1, Math.max(0, parsed.confidence_score))
        : 0.5,
    questions_for_user: parsed.questions_for_user ?? [],
    search_keywords: parsed.search_keywords ?? [],
  };
}

// Mock fallback used when LM Studio is unavailable (for UI testing)
export function mockListingDraft(photoCount: number): AIListingDraft {
  return {
    title: "[MOCK] Used Item — Please Review and Edit",
    short_title: "[MOCK] Used Item",
    category_guess: "Everything Else",
    condition_guess: "Good",
    description:
      "This is a MOCK listing generated because LM Studio was not reachable. Please edit all fields before publishing.",
    item_specifics: {
      Brand: "uncertain",
      Model: "uncertain",
      Color: "uncertain",
      Condition: "Good",
    },
    visible_defects: ["Mock listing — defects not analyzed"],
    what_cannot_be_verified: [
      "All fields require manual verification (mock mode)",
    ],
    suggested_price_range: {
      low: 0,
      high: 0,
      reasoning: `Mock mode — ${photoCount} photo(s) uploaded but AI was not called.`,
    },
    shipping_recommendation: "USPS Priority Mail",
    confidence_score: 0,
    questions_for_user: [
      "LM Studio was not reachable. Is it running on localhost:1234?",
      "Check your LM_STUDIO_BASE_URL in .env.local",
    ],
    search_keywords: [],
  };
}
