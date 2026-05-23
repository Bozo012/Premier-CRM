// Strict JSON shape the AI must return
export interface AIListingDraft {
  title: string;
  short_title: string;
  category_guess: string;
  condition_guess: string;
  description: string;
  item_specifics: Record<string, string>;
  visible_defects: string[];
  what_cannot_be_verified: string[];
  suggested_price_range: {
    low: number;
    high: number;
    reasoning: string;
  };
  shipping_recommendation: string;
  confidence_score: number;
  questions_for_user: string[];
  search_keywords: string[];
}

export type ListingStatus =
  | "draft"
  | "generating"
  | "reviewing"
  | "ready"
  | "published_mock";

// Hydrated listing returned from API (JSON fields parsed)
export interface HydratedListing {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ListingStatus;
  photos: string[];
  aiRaw: AIListingDraft | null;
  title: string | null;
  shortTitle: string | null;
  categoryGuess: string | null;
  condition: string | null;
  description: string | null;
  itemSpecifics: Record<string, string> | null;
  visibleDefects: string[] | null;
  cannotVerify: string[] | null;
  priceLow: number | null;
  priceHigh: number | null;
  priceReasoning: string | null;
  shipping: string | null;
  confidence: number | null;
  questions: string[] | null;
  keywords: string[] | null;
  ebayListingId: string | null;
  ebayPublishedAt: string | null;
  ebayMockUrl: string | null;
}

export const CONDITION_OPTIONS = [
  "New",
  "Like New",
  "Very Good",
  "Good",
  "Acceptable",
  "For Parts or Not Working",
] as const;
