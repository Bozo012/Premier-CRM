/**
 * employee-invite-bot: the real owner-invites-employee flow — Kevin invites
 * Brandon, Brandon accepts independently (his own browser context, his own
 * credentials), Kevin sees him become an active team member.
 *
 * Uses a DEDICATED test-only employee account (TEST_EMPLOYEE_EMAIL/PASSWORD/
 * NAME) — never Brandon's real email. The account is reset (deleted, if it
 * already exists from a previous run) at the start of this suite via
 * tightly-guarded service-role helpers (utils/cleanup.ts's
 * deleteTestAuthUserByEmail/cleanupTestOrgInvitesByEmail — both refuse to
 * touch anything that isn't a recognized test-only email).
 *
 * Real signup requires confirming a real email in this environment (Supabase
 * Auth's "Confirm email" is enabled — see supabase/migrations and
 * apps/web/app/auth/confirm/route.ts). Since there's no test-inbox provider
 * in this repo, this bot obtains a valid confirmation link the same way
 * Supabase's own docs recommend testing this flow: `auth.admin.generateLink()`
 * with a service-role client, which reuses the exact "Confirm signup" email
 * template already configured in the dashboard — never a raw token exposed
 * in production UI, and never a hand-rolled bypass of the real confirmation
 * mechanism.
 */

import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import {
  getEmployeeAccount,
  getEmployeeName,
  hasAdminCredentials,
  hasEmployeeCredentials,
  loginAs,
} from './utils/auth';
import { loginAsAdmin } from './context/auth';
import { createTestSession, type TestSession } from './context/session';
import {
  cleanupTestOrgInvitesByEmail,
  createGuardedServiceClient,
  deleteTestAuthUserByEmail,
} from './utils/cleanup';
import { buildMarker } from './utils/test-data';
import { inviteAcceptPage, routes, team } from './utils/selectors';

const canRun = () => hasAdminCredentials() && hasEmployeeCredentials();
const SKIP_REASON =
  'TEST_ADMIN_EMAIL/PASSWORD and/or TEST_EMPLOYEE_EMAIL/PASSWORD/NAME not set in .env.test';

/**
 * A throwaway, unauthenticated page for checking what an invite link shows
 * without disturbing the owner's own logged-in page. Playwright's test-
 * fixture `page`'s own context refuses `.newPage()` directly ("Please use
 * browser.newContext()") — this opens a genuinely separate context instead.
 */
async function openThrowawayPage(fromPage: Page): Promise<Page> {
  const browser = fromPage.context().browser();
  if (!browser) throw new Error('No browser available to open a throwaway page.');
  const context = await browser.newContext();
  return context.newPage();
}

test.describe('employee invite bot', () => {
  test.describe.serial('owner invites, employee accepts independently', () => {
    let session: TestSession;
    let employeeBrowser: Browser | undefined;
    let employeePage: Page;
    let inviteToken: string | undefined;

    test.beforeAll(async ({ browser }) => {
      test.skip(!canRun(), SKIP_REASON);
      const page = await browser.newPage();
      session = createTestSession(page);
      await loginAsAdmin(session);

      // Reset the dedicated employee account so this suite is repeatable —
      // never touches anything but this exact test-only email (see guards
      // in utils/cleanup.ts).
      const employee = getEmployeeAccount();
      await deleteTestAuthUserByEmail(employee.email);
      await cleanupTestOrgInvitesByEmail(employee.email);
    });

    test.afterAll(async () => {
      if (!session) return;
      const employee = getEmployeeAccount();
      await deleteTestAuthUserByEmail(employee.email);
      await cleanupTestOrgInvitesByEmail(employee.email);
      await session.finish();
      await employeeBrowser?.close();
    });

    test('1. owner can access team management', async () => {
      const { page } = session;
      await page.goto(routes.team);
      await expect(team.heading(page)).toBeVisible();
      await expect(page.locator('#invite-fullName')).toBeVisible();
      await expect(page.locator('#invite-email')).toBeVisible();
      await expect(
        team.inviteRoleSelect(session.page).locator('option[value="employee"]')
      ).toHaveText('Employee');
    });

    test('2. owner can create an employee invite', async () => {
      const { page } = session;
      const employee = getEmployeeAccount();

      await page.goto(routes.team);
      await team.inviteFullNameInput(page).fill(getEmployeeName());
      await team.inviteEmailInput(page).fill(employee.email);
      await team.inviteRoleSelect(page).selectOption('employee');
      await team.sendInviteButton(page).click();

      await expect(team.pendingInvitesHeading(page)).toBeVisible({ timeout: 10_000 });
      const card = team.pendingInviteCard(page, employee.email);
      await expect(card).toBeVisible();
      await expect(card.getByText(employee.email)).toBeVisible();
      await expect(card.getByText('employee', { exact: true })).toBeVisible();
    });

    test('3. duplicate pending invite is handled clearly', async () => {
      const { page } = session;
      const employee = getEmployeeAccount();

      await page.goto(routes.team);
      await team.inviteFullNameInput(page).fill(getEmployeeName());
      await team.inviteEmailInput(page).fill(employee.email);
      await team.inviteRoleSelect(page).selectOption('employee');
      await team.sendInviteButton(page).click();

      // createOrgInvite() surfaces the partial-unique-index violation
      // (org_id, lower(email)) WHERE status='pending' as this friendly error
      // — never a second silent pending row.
      await expect(page.getByText(/already.*pending invite/i)).toBeVisible({ timeout: 10_000 });
    });

    test('4. invite link is valid', async () => {
      const employee = getEmployeeAccount();
      const client = createGuardedServiceClient();
      const { data } = await client
        .from('org_invites')
        .select('token')
        .eq('email', employee.email.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(data?.token, 'expected a pending invite token for the test employee').toBeTruthy();
      inviteToken = data!.token;

      // Fresh, throwaway page (not the owner's) just to confirm the link
      // itself resolves to a real, usable acceptance form.
      const checkPage = await openThrowawayPage(session.page);
      await checkPage.goto(`${routes.invite}/${inviteToken}`);
      await expect(inviteAcceptPage.setUpAccountHeading(checkPage)).toBeVisible();
      await expect(inviteAcceptPage.fullNameInput(checkPage)).toBeVisible();
      await checkPage.close();
    });

    test('5. employee can accept the invite in a separate browser context', async () => {
      const employee = getEmployeeAccount();

      employeeBrowser = await chromium.launch();
      const context = await employeeBrowser.newContext();
      employeePage = await context.newPage();

      await employeePage.goto(`${routes.invite}/${inviteToken}`);
      await inviteAcceptPage.fullNameInput(employeePage).fill(getEmployeeName());
      await inviteAcceptPage.passwordInput(employeePage).fill(employee.password);
      await inviteAcceptPage.createAccountButton(employeePage).click();

      await expect(inviteAcceptPage.checkEmailHeading(employeePage)).toBeVisible({
        timeout: 10_000,
      });

      // No test-inbox provider in this repo — obtain a real, valid OTP token
      // via the service-role admin API rather than a real email.
      //
      // Important: `generateLink()`'s own `action_link` is NOT a substitute
      // for the real templated email link — verified directly (a one-off
      // diagnostic call showed it): it always points at Supabase's raw
      // hosted verify endpoint (`.../auth/v1/verify?token=...&redirect_to=...`,
      // implicit flow, tokens in a URL hash fragment) regardless of the
      // dashboard's "Confirm signup" template, and its `redirect_to` defaults
      // to the project's Site URL rather than this signUp() call's
      // `emailRedirectTo`. Using it directly never reaches this app's own
      // /auth/confirm route at all. So instead: take the real, valid
      // `hashed_token` generateLink() returns and build the URL ourselves in
      // exactly the shape the dashboard template produces (per
      // apps/web/app/auth/confirm/route.ts's doc comment) — this exercises
      // this app's own confirm → continue → accept_org_invite() path for
      // real, using a real Supabase-issued token, without depending on
      // generateLink()'s unrelated default redirect behavior.
      const client = createGuardedServiceClient();
      const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
        type: 'signup',
        email: employee.email,
        password: employee.password,
      });
      expect(linkError, linkError?.message).toBeNull();
      const hashedToken = linkData?.properties?.hashed_token;
      expect(hashedToken, 'expected generateLink() to return a hashed_token').toBeTruthy();

      const nextParam = encodeURIComponent(`${routes.invite}/${inviteToken}/continue`);
      await employeePage.goto(`/auth/confirm?token_hash=${hashedToken}&type=email&next=${nextParam}`);

      // /auth/confirm -> verifyOtp() -> /invite/{token}/continue ->
      // accept_org_invite() -> /today, all server-side redirects.
      await expect(employeePage).toHaveURL(new RegExp(`${routes.today}$`), { timeout: 15_000 });
    });

    test('6. employee can log out and log back in', async () => {
      const employee = getEmployeeAccount();

      // Log out: real sign-out control, same one any authenticated page exposes.
      await employeePage.getByRole('button', { name: /sign out/i }).click();
      await expect(employeePage).toHaveURL(/\/login/, { timeout: 10_000 });

      await loginAs(employeePage, employee);
      await expect(employeePage).not.toHaveURL(/\/login/);
      await expect(employeePage).not.toHaveURL(new RegExp(`${routes.invite}`));
    });

    test('7. owner sees the employee as active', async () => {
      const { page } = session;
      const employee = getEmployeeAccount();

      await page.goto(routes.team);
      await expect(team.currentTeamHeading(page)).toBeVisible();
      await expect(page.getByText(employee.email)).toBeVisible();

      // No longer in the pending list.
      const stillPending = await team.pendingInviteCard(page, employee.email).isVisible().catch(() => false);
      expect(stillPending).toBe(false);
    });

    test('8. owner can revoke a pending invite', async () => {
      const { page } = session;
      const revokeMarker = buildMarker('EMPLOYEE_REVOKE');
      const revokeEmail = `e2e-invite-revoke-${Date.now()}@example.com`;

      await page.goto(routes.team);
      await team.inviteFullNameInput(page).fill(revokeMarker);
      await team.inviteEmailInput(page).fill(revokeEmail);
      await team.inviteRoleSelect(page).selectOption('employee');
      await team.sendInviteButton(page).click();
      await expect(team.pendingInviteCard(page, revokeEmail)).toBeVisible({ timeout: 10_000 });

      await team.revokeButton(page, revokeEmail).click();
      await expect(team.pendingInviteCard(page, revokeEmail)).toHaveCount(0, { timeout: 10_000 });

      // Revoked link can no longer be accepted.
      const client = createGuardedServiceClient();
      const { data } = await client
        .from('org_invites')
        .select('token, status')
        .eq('email', revokeEmail)
        .maybeSingle();
      expect(data?.status).toBe('revoked');

      const revokedCheckPage = await openThrowawayPage(page);
      await revokedCheckPage.goto(`${routes.invite}/${data!.token}`);
      await expect(inviteAcceptPage.invalidHeading(revokedCheckPage)).toBeVisible();
      await revokedCheckPage.close();

      await cleanupTestOrgInvitesByEmail(revokeEmail);
    });

    test.skip('owner can resend a pending invite', async () => {
      // NOT IMPLEMENTED: there is no "resend" action anywhere in the app —
      // only create (team/actions.ts's createInviteAction) and revoke exist
      // (verified: grepped apps/web/app/(app)/team for any resend action or
      // button). Re-inviting the same address today requires revoking the
      // existing pending invite first (the partial unique index on
      // (org_id, lower(email)) WHERE status='pending' blocks a second one).
      // Implement a resendInviteAction (likely: re-send the same row's email
      // without creating a new token/row) once product wants this.
    });

    test('9. expired invite cannot be accepted', async () => {
      const { page } = session;
      const expiredEmail = `e2e-invite-expired-${Date.now()}@example.com`;
      const expiredMarker = buildMarker('EMPLOYEE_EXPIRED');

      await page.goto(routes.team);
      await team.inviteFullNameInput(page).fill(expiredMarker);
      await team.inviteEmailInput(page).fill(expiredEmail);
      await team.inviteRoleSelect(page).selectOption('employee');
      await team.sendInviteButton(page).click();
      await expect(team.pendingInviteCard(page, expiredEmail)).toBeVisible({ timeout: 10_000 });

      // Backdating expires_at is the only way to produce an expired invite
      // without waiting 14 real days — a direct, tightly-scoped service-role
      // edit to a row this test itself just created, not a broad update.
      const client = createGuardedServiceClient();
      const { data: invite } = await client
        .from('org_invites')
        .select('id, token')
        .eq('email', expiredEmail)
        .single();
      await client
        .from('org_invites')
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('id', invite!.id);

      const expiredCheckPage = await openThrowawayPage(page);
      await expiredCheckPage.goto(`${routes.invite}/${invite!.token}`);
      await expect(inviteAcceptPage.invalidHeading(expiredCheckPage)).toBeVisible();
      await expect(expiredCheckPage.getByText(/expired/i)).toBeVisible();
      await expiredCheckPage.close();

      // The UI already correctly refuses this invite (asserted above) purely
      // by comparing expires_at client-side — accept_org_invite() is what
      // actually flips the DB row's status to 'expired', and only when
      // someone attempts to accept it. Since accepting is exactly what this
      // test proves shouldn't be possible, the row is still status='pending'
      // at this point despite being unusable — so it still holds the
      // partial-unique-index's pending-per-email slot. Revoke it first (the
      // same real action test 8 covers) so a genuinely new replacement
      // invite can be created, rather than the UI just re-showing this one.
      await team.revokeButton(page, expiredEmail).click();
      await expect(team.pendingInviteCard(page, expiredEmail)).toHaveCount(0, { timeout: 10_000 });

      // Owner can still issue a fresh replacement invite for the same address.
      await team.inviteFullNameInput(page).fill(expiredMarker);
      await team.inviteEmailInput(page).fill(expiredEmail);
      await team.inviteRoleSelect(page).selectOption('employee');
      await team.sendInviteButton(page).click();
      await expect(team.pendingInviteCard(page, expiredEmail)).toBeVisible({ timeout: 10_000 });

      // Prove it's a genuinely new invite, not the same row re-displayed.
      const { data: replacement } = await client
        .from('org_invites')
        .select('id')
        .eq('email', expiredEmail)
        .eq('status', 'pending')
        .single();
      expect(replacement?.id).not.toBe(invite!.id);

      await cleanupTestOrgInvitesByEmail(expiredEmail);
    });
  });

  test.skip('email mismatch: accepting with a different confirmed email is rejected', async () => {
    // NOT IMPLEMENTED as an automated test: would require confirming a
    // second real email address to attempt cross-email acceptance.
    // accept_org_invite() already defends against this at the DB layer
    // (lower(auth user email) must equal lower(invite.email) — see
    // supabase/migrations/20260723000001_org_invites_function_hardening.sql)
    // and apps/web/app/invite/[token]/continue/route.ts re-checks it
    // server-side before calling the RPC. Worth a dedicated test once a
    // second disposable test-only mailbox convention exists.
  });
});
