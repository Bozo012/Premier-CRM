// TODO: Replace with real eBay Sell Inventory API when credentials are available.
// Docs: https://developer.ebay.com/api-docs/sell/inventory/resources/methods
// Required: eBay Developer account (free at developer.ebay.com), OAuth token exchange.
// Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_OAUTH_TOKEN in .env.local to enable.

import type { HydratedListing } from "./types";

export interface EbayPublishResult {
  mock: true;
  listingId: string;
  url: string;
  title: string;
  price: number;
  publishedAt: string;
}

export async function mockPublishToEbay(
  listing: HydratedListing
): Promise<EbayPublishResult> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 800));

  const fakeId = `mock-${listing.id.slice(0, 8).toUpperCase()}`;
  const price = listing.priceLow
    ? (listing.priceLow + (listing.priceHigh ?? listing.priceLow)) / 2
    : 9.99;

  return {
    mock: true,
    listingId: fakeId,
    url: `https://www.ebay.com/itm/${fakeId}`,
    title: listing.title ?? "Untitled Item",
    price,
    publishedAt: new Date().toISOString(),
  };
}

// TODO: Real eBay integration entry point
// export async function publishToEbay(listing: HydratedListing): Promise<EbayPublishResult> {
//   const token = await getEbayOAuthToken();
//   const inventoryItem = buildInventoryItem(listing);
//   const offer = buildOffer(listing);
//   await createOrReplaceInventoryItem(token, listing.id, inventoryItem);
//   const offerId = await createOffer(token, offer);
//   const { listingId } = await publishOffer(token, offerId);
//   return { listingId, url: `https://www.ebay.com/itm/${listingId}`, ... };
// }
