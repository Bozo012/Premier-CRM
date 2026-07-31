import type { DbClient } from '@premier/db';

/**
 * Resolves the email addresses of an org's active owner/admin members, for
 * staff-facing notifications (e.g. customer-lifecycle-notifications.ts's
 * sendQuoteRespondedNotification) that have no single "the customer" email
 * to send to. Uses `auth.admin.getUserById()` per member rather than
 * paginating `listUsers()` (findAuthUserByEmail's approach above), since we
 * already have the exact user ids from org_members.
 */
export async function getOrgOwnerAndAdminEmails(
  serviceClient: DbClient,
  orgId: string
): Promise<string[]> {
  const { data: members, error } = await serviceClient
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);

  if (error || !members?.length) {
    return [];
  }

  const emails = await Promise.all(
    members.map(async (member) => {
      const { data } = await serviceClient.auth.admin.getUserById(member.user_id);
      return data.user?.email ?? null;
    })
  );

  return emails.filter((email): email is string => Boolean(email));
}

/**
 * Looks up an existing Supabase Auth user by email via the admin API
 * (paginated — there is no direct "get user by email" endpoint). Used by
 * team/actions.ts's createInviteAction to decide which of the two Auth
 * Reset onboarding paths applies: `admin.inviteUserByEmail()` for a
 * genuinely new address, or the existing-confirmed-user join email for one
 * that already has a confirmed account.
 */
export async function findAuthUserByEmail(
  serviceClient: DbClient,
  email: string
): Promise<{ id: string; confirmedAt: string | null } | null> {
  const lowerEmail = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Auth user lookup failed: ${error.message}`);
    }

    const match = data.users.find((u) => u.email?.toLowerCase() === lowerEmail);
    if (match) {
      return { id: match.id, confirmedAt: match.confirmed_at ?? null };
    }

    if (data.users.length < 200) break;
  }

  return null;
}
