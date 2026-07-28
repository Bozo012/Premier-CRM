import type { DbClient } from '@premier/db';

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
