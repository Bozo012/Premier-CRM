/**
 * demonstration-org-bootstrap-bot: proves bootstrap_demonstration_organization()
 * is idempotent (rerunning never creates a duplicate) and restricted to
 * service_role (never directly callable by an authenticated client). This
 * test creates and fully removes its own throwaway invocation of the
 * bootstrap function — it does NOT touch or assume anything about the real,
 * permanent Forge Demonstration organization (renamed from "Premier CRM
 * Demonstration" — see docs/architecture/forge-foundry-naming-audit.md)
 * that a one-off administrative script creates in production.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';
import { hasApiTestCredentials } from './utils/auth';

const canRun = () => hasApiTestCredentials() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_REASON = 'NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY not set in .env.test';

test.describe('demonstration organization bootstrap bot', () => {
  let admin: SupabaseClient<Database>;
  let initiatorUserId: string;
  let demoOrgId: string | null = null;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const email = `e2e-bootstrap-initiator-${Date.now()}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: `Boot_${Date.now()}!1A`, email_confirm: true });
    if (error || !created.user) throw new Error(`createUser: ${error?.message}`);
    initiatorUserId = created.user.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Only remove the org if THIS test run actually created it (i.e. it
    // didn't already exist from a real prior bootstrap) — never delete a
    // pre-existing Demo org this test happens to find.
    if (demoOrgId) {
      const { data: org } = await admin.from('organizations').select('created_at').eq('id', demoOrgId).maybeSingle();
      // Heuristic guard: only clean up if created within this test's own run window.
      if (org && Date.now() - new Date(org.created_at).getTime() < 5 * 60 * 1000) {
        await admin.from('activity_log').delete().eq('org_id', demoOrgId);
        await admin.from('organizations').delete().eq('id', demoOrgId);
      }
    }
    if (initiatorUserId) await admin.auth.admin.deleteUser(initiatorUserId);
  });

  test('1. is restricted to service_role — a real authenticated client is denied', async () => {
    const email = `e2e-bootstrap-denied-${Date.now()}@example.com`;
    const password = `Boot_${Date.now()}!1A`;
    const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    await client.auth.signInWithPassword({ email, password });
    const { error } = await client.rpc('bootstrap_demonstration_organization', { p_initiator_user_id: created!.user!.id });
    expect(error).not.toBeNull();
    await admin.auth.admin.deleteUser(created!.user!.id);
  });

  test('2. is idempotent — two calls return the same organization ID, no duplicate row', async () => {
    const { data: firstCall, error: firstErr } = await admin.rpc('bootstrap_demonstration_organization', { p_initiator_user_id: initiatorUserId });
    expect(firstErr).toBeNull();
    demoOrgId = firstCall as string;

    const { data: secondCall, error: secondErr } = await admin.rpc('bootstrap_demonstration_organization', { p_initiator_user_id: initiatorUserId });
    expect(secondErr).toBeNull();
    expect(secondCall).toBe(firstCall);

    const { count } = await admin.from('organizations').select('id', { count: 'exact', head: true }).eq('slug', 'premier-crm-demonstration');
    expect(count).toBe(1);
  });

  test('3. creates an audit record identifying who initiated it', async () => {
    const { data: log } = await admin
      .from('activity_log')
      .select('event_type, actor_user_id, message')
      .eq('org_id', demoOrgId!)
      .eq('event_type', 'organization_bootstrapped')
      .maybeSingle();
    expect(log).not.toBeNull();
    expect(log?.actor_user_id).toBe(initiatorUserId);
  });

  test('4. the created organization has the expected identity and timezone', async () => {
    const { data: org } = await admin.from('organizations').select('name, slug, timezone').eq('id', demoOrgId!).single();
    // The RPC itself still inserts the literal 'Premier CRM Demonstration'
    // name for a brand-new org (that migration is immutable) — but against
    // premier-crm-e2e/prod the org already exists, so this call returns the
    // existing row, whose display name was renamed to 'Forge Demonstration'
    // by migration 20260803060000. Accept either so this test passes both
    // against a fresh database (migrations only) and the real, already-
    // renamed environments.
    expect(['Premier CRM Demonstration', 'Forge Demonstration']).toContain(org.name);
    expect(org.slug).toBe('premier-crm-demonstration');
    expect(org.timezone).toBe('America/New_York');
  });
});
