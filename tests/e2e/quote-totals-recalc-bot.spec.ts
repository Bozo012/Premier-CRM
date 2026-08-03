/**
 * quote-totals-recalc-bot: proves the fix for a real production defect
 * found while populating the Premier CRM Demonstration organization —
 * create_quote_from_estimate() copied estimate_line_items into
 * quote_line_items but never recalculated the quote's subtotal/tax/total,
 * leaving every RPC-created quote at $0.00 despite correctly-priced line
 * items. Fixed by a single SQL function (recalc_quote_totals) fired by an
 * AFTER INSERT/UPDATE/DELETE trigger on quote_line_items — this test
 * proves the RPC path is now correct immediately on return, and that
 * manual line-item editing (which already worked before this fix) still
 * produces the same correct result through the same single formula.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { addQuoteLineItem, updateQuoteLineItem, removeQuoteLineItem } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('quote totals recalculation bot', () => {
  let admin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let orgId: string;
  let customerId: string;
  let propertyId: string;
  let userId: string;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    orgId = crypto.randomUUID();
    await admin.from('organizations').insert({ id: orgId, name: 'E2E_QUOTE_TOTALS_ORG', slug: `e2e-quote-totals-${Date.now()}` });

    const { data: customer } = await admin
      .from('customers')
      .insert({ org_id: orgId, type: 'residential', first_name: 'Totals', last_name: 'Fixture', source: 'manual_staff_entry' })
      .select('id')
      .single();
    customerId = customer!.id;

    const { data: property } = await admin
      .from('properties')
      .insert({ org_id: orgId, address_line_1: '1 Totals Way', city: 'Testville', state: 'NY', zip: '10001', country: 'US' })
      .select('id')
      .single();
    propertyId = property!.id;

    const email = `e2e-quote-totals-${Date.now()}@example.com`;
    const password = `Totals_${Math.random().toString(36).slice(2)}!1`;
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = created!.user!.id;
    await admin.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner', status: 'active' });

    userClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    await userClient.auth.signInWithPassword({ email, password });
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('org_members').delete().eq('org_id', orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('properties').delete().eq('org_id', orgId);
    await admin.from('customers').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  });

  async function createReviewedEstimate(): Promise<string> {
    // Line items must be added BEFORE pricing is marked reviewed —
    // enforce_estimate_pricing_lock() blocks editing estimate_line_items
    // once pricing_reviewed_at is set, matching the real staff workflow
    // (draft -> add/edit line items -> approve pricing, never the reverse).
    const { data: estimate } = await admin
      .from('estimates')
      .insert({ org_id: orgId, customer_id: customerId, property_id: propertyId, title: 'Totals fixture estimate' })
      .select('id')
      .single();
    const estimateId = estimate!.id;
    const { error: lineItemErr } = await admin.from('estimate_line_items').insert([
      { org_id: orgId, estimate_id: estimateId, description: 'Gutter cleaning', quantity: 1, unit_price: 185, sort_order: 0 },
      { org_id: orgId, estimate_id: estimateId, description: 'Downspout service', quantity: 1, unit_price: 45, sort_order: 1 },
    ]);
    if (lineItemErr) throw new Error(`estimate_line_items insert failed: ${lineItemErr.message}`);
    const { error: reviewErr } = await admin
      .from('estimates')
      .update({ pricing_reviewed_at: new Date().toISOString(), pricing_reviewed_by: userId })
      .eq('id', estimateId);
    if (reviewErr) throw new Error(`pricing review update failed: ${reviewErr.message}`);
    return estimateId;
  }

  test('1. an RPC-created quote has the correct total immediately on return — no longer $0.00', async () => {
    const estimateId = await createReviewedEstimate();
    const { data: quoteId, error } = await userClient.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
    expect(error).toBeNull();

    const { data: quote } = await admin.from('quotes').select('subtotal, tax_amount, total').eq('id', quoteId!).single();
    expect(quote?.subtotal).toBe(230);
    expect(quote?.tax_amount).toBe(0);
    expect(quote?.total).toBe(230);

    const { data: lineItems } = await admin.from('quote_line_items').select('description, quantity, unit_price, total_quoted').eq('quote_id', quoteId!);
    expect(lineItems).toHaveLength(2);
    const sum = (lineItems ?? []).reduce((s, li) => s + (li.total_quoted ?? 0), 0);
    expect(sum).toBe(230);
  });

  test('2. tax_pct is honored — total includes tax computed from the correct subtotal', async () => {
    const estimateId = await createReviewedEstimate();
    const { data: quoteId } = await userClient.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
    await admin.from('quotes').update({ tax_pct: 8 }).eq('id', quoteId!);
    // Re-trigger recalculation via the same mechanism a manual edit would use.
    await admin.rpc('recalc_quote_totals', { p_quote_id: quoteId! });

    const { data: quote } = await admin.from('quotes').select('subtotal, tax_amount, total').eq('id', quoteId!).single();
    expect(quote?.subtotal).toBe(230);
    expect(quote?.tax_amount).toBe(18.4);
    expect(quote?.total).toBe(248.4);
  });

  test('3. repeated create_quote_from_estimate calls do not duplicate the quote or reset totals', async () => {
    const estimateId = await createReviewedEstimate();
    const { data: firstId } = await userClient.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
    const { error: secondErr } = await userClient.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });
    expect(secondErr).not.toBeNull(); // guarded by the existing "active quote already exists" check

    const { count } = await admin.from('quotes').select('id', { count: 'exact', head: true }).eq('estimate_id', estimateId);
    expect(count).toBe(1);
    const { data: quote } = await admin.from('quotes').select('total').eq('id', firstId!).single();
    expect(quote?.total).toBe(230);
  });

  test('4. manual line-item editing (addQuoteLineItem/updateQuoteLineItem/removeQuoteLineItem) still recalculates correctly through the same single formula', async () => {
    const estimateId = await createReviewedEstimate();
    const { data: quoteId } = await userClient.rpc('create_quote_from_estimate', { p_estimate_id: estimateId });

    const added = await addQuoteLineItem(admin, {
      orgId,
      input: { quoteId: quoteId!, name: 'Extra service', unit: 'ea', quantity: 1, unitPrice: 20 },
    });
    expect(added.success).toBe(true);
    let quote = (await admin.from('quotes').select('total').eq('id', quoteId!).single()).data;
    expect(quote?.total).toBe(250);

    if (added.success) {
      await updateQuoteLineItem(admin, { orgId, input: { lineItemId: added.data.id, quoteId: quoteId!, name: 'Extra service', unit: 'ea', quantity: 2, unitPrice: 20 } });
      quote = (await admin.from('quotes').select('total').eq('id', quoteId!).single()).data;
      expect(quote?.total).toBe(270);

      await removeQuoteLineItem(admin, { orgId, input: { lineItemId: added.data.id, quoteId: quoteId! } });
      quote = (await admin.from('quotes').select('total').eq('id', quoteId!).single()).data;
      expect(quote?.total).toBe(230);
    }
  });
});
