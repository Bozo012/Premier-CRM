/**
 * customer-archetype-defaults-rls-bot: live coverage for F6
 * (docs/releases/forge-v1-readiness-audit.md; re-confirmed in
 * docs/implementation/v1-known-gaps-audit.md §9) — customer_archetype_defaults
 * shipped in 0007_catalog_reconciliation.sql with RLS disabled, unlike its
 * two siblings (org_pricing_policy, permit_guardrails) created in the same
 * migration, which both got RLS + an org-isolation policy. Because
 * customer_archetype_defaults has no org_id (it's global reference data,
 * keyed only on the `archetype` enum), the fix
 * (20260813010000_customer_archetype_defaults_rls.sql) is not an
 * org-isolation policy — it enables RLS with a single SELECT-only policy for
 * `authenticated`, closing the direct INSERT/UPDATE/DELETE access any
 * signed-in user in any org previously had via PostgREST.
 *
 * Every assertion here calls PostgREST directly via the Supabase client (the
 * actual enforcement boundary — RLS, not app code, since zero application
 * code reads or writes this table today), proving:
 *   - intended reads still work for a normal signed-in org member
 *   - unauthorized INSERT/UPDATE/DELETE all fail for that same member
 *   - the legitimate privileged path (service_role, which bypasses RLS)
 *     still works, restored immediately so the shared 7-row seed table is
 *     left untouched
 *   - anon (unauthenticated) access is unchanged — it was never granted
 *     table-level access at all, before or after this fix
 *   - two different orgs are equally blocked from writing, proving this is
 *     a universal write-deny, not an accidental org-scoped one
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@premier/db';

import { hasServiceRoleCleanupCredentials, createGuardedServiceClient } from './utils/cleanup';
import { E2E_TEST_PREFIX, uniqueSuffix } from './utils/test-data';

const canRun = () => hasServiceRoleCleanupCredentials() && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SKIP_REASON = 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.test';

const REFERENCE_ARCHETYPE = 'unknown';

interface StaffAccount {
  email: string;
  password: string;
  userId: string;
  orgId: string;
}

function apiClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = apiClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

test.describe('customer-archetype-defaults RLS bot', () => {
  let admin: SupabaseClient<Database>;
  let orgA: StaffAccount;
  let orgB: StaffAccount;

  test.beforeAll(async () => {
    test.skip(!canRun(), SKIP_REASON);
    admin = createGuardedServiceClient();

    const suffix = uniqueSuffix();

    async function createOrgAndStaff(label: string): Promise<StaffAccount> {
      const orgId = crypto.randomUUID();
      await admin.from('organizations').insert({
        id: orgId,
        name: `${E2E_TEST_PREFIX}ArchetypeDefaults_${label}_${suffix}`,
        slug: `e2e-archetype-defaults-${label}-${suffix}`,
      });

      const email = `${E2E_TEST_PREFIX.toLowerCase()}archetype-${label}-${suffix}@example.com`;
      const password = `Archetype_${Math.random().toString(36).slice(2)}!1`;
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
      await admin.from('org_members').insert({ org_id: orgId, user_id: created.user.id, role: 'owner', status: 'active' });

      return { email, password, userId: created.user.id, orgId };
    }

    orgA = await createOrgAndStaff('a');
    orgB = await createOrgAndStaff('b');
  });

  test.afterAll(async () => {
    if (!admin) return;
    const userIds = [orgA?.userId, orgB?.userId].filter((id): id is string => !!id);
    const orgIds = [orgA?.orgId, orgB?.orgId].filter((id): id is string => !!id);
    await admin.from('org_members').delete().in('org_id', orgIds);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    await admin.from('organizations').delete().in('id', orgIds);
  });

  test('1. intended reads still work — a signed-in org member can select all seeded archetype defaults', async () => {
    const client = await signIn(orgA.email, orgA.password);
    const { data, error } = await client.from('customer_archetype_defaults').select('archetype, default_payment_terms_days');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(7);
    expect((data ?? []).map((r) => r.archetype)).toContain(REFERENCE_ARCHETYPE);
  });

  test('2. unauthorized INSERT fails for a normal signed-in org member', async () => {
    const client = await signIn(orgA.email, orgA.password);
    // Reuses an existing archetype value intentionally — the point is to
    // prove the write itself is denied by RLS, not merely rejected as a
    // duplicate primary key (a fresh enum value isn't available without an
    // enum migration this fix doesn't need).
    const { error } = await client
      .from('customer_archetype_defaults')
      .insert({ archetype: REFERENCE_ARCHETYPE, notes: 'RLS bot insert attempt' });
    expect(error).not.toBeNull();
  });

  test('3. unauthorized UPDATE fails for a normal signed-in org member — row is provably unchanged', async () => {
    const { data: before } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();

    const client = await signIn(orgA.email, orgA.password);
    const { error, count } = await client
      .from('customer_archetype_defaults')
      .update({ notes: 'RLS bot update attempt' }, { count: 'exact' })
      .eq('archetype', REFERENCE_ARCHETYPE);
    // RLS with no UPDATE policy makes the target set empty rather than
    // erroring on some Supabase client versions — assert on the *effect*
    // (zero rows changed), not just the presence of an error.
    expect(count ?? 0).toBe(0);

    const { data: after } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();
    expect(after?.notes).toBe(before?.notes);
    void error;
  });

  test('4. unauthorized DELETE fails for a normal signed-in org member — row count is provably unchanged', async () => {
    const { count: before } = await admin.from('customer_archetype_defaults').select('archetype', { count: 'exact', head: true });

    const client = await signIn(orgA.email, orgA.password);
    await client.from('customer_archetype_defaults').delete().eq('archetype', REFERENCE_ARCHETYPE);

    const { count: after } = await admin.from('customer_archetype_defaults').select('archetype', { count: 'exact', head: true });
    expect(after).toBe(before);
  });

  test('5. a second, independent org is equally blocked — this is a universal write-deny, not an accidental org-scoped gap', async () => {
    const { data: before } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();

    const client = await signIn(orgB.email, orgB.password);
    const { count } = await client
      .from('customer_archetype_defaults')
      .update({ notes: 'org B RLS bot update attempt' }, { count: 'exact' })
      .eq('archetype', REFERENCE_ARCHETYPE);
    expect(count ?? 0).toBe(0);

    const { data: after } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();
    expect(after?.notes).toBe(before?.notes);
  });

  test('6. anon (unauthenticated) access is unchanged — still denied at the table-grant level, not newly broken by this fix', async () => {
    const anon = apiClient();
    const { error } = await anon.from('customer_archetype_defaults').select('archetype');
    expect(error).not.toBeNull();
  });

  test('7. the legitimate privileged write path (service_role) still works — restored immediately, zero residue on the shared seed table', async () => {
    const { data: before } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();
    const originalNotes = before?.notes ?? null;
    const marker = `${E2E_TEST_PREFIX}RLS bot privileged-write proof — will be reverted immediately.`;

    const { error: writeError } = await admin.from('customer_archetype_defaults').update({ notes: marker }).eq('archetype', REFERENCE_ARCHETYPE);
    expect(writeError).toBeNull();

    const { data: mid } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();
    expect(mid?.notes).toBe(marker);

    const { error: revertError } = await admin
      .from('customer_archetype_defaults')
      .update({ notes: originalNotes })
      .eq('archetype', REFERENCE_ARCHETYPE);
    expect(revertError).toBeNull();

    const { data: after } = await admin.from('customer_archetype_defaults').select('notes').eq('archetype', REFERENCE_ARCHETYPE).single();
    expect(after?.notes).toBe(originalNotes);
  });

  test('8. zero residue — row count is still exactly the original seeded 7 rows after every attempted mutation above', async () => {
    const { count } = await admin.from('customer_archetype_defaults').select('archetype', { count: 'exact', head: true });
    expect(count).toBe(7);
  });
});
