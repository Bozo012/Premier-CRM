import { z } from 'zod';

import { TeamMemberApprovalRoleSchema } from './team-member-approval';

export const TeamMemberInviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required.')
    .max(120, 'Full name must be 120 characters or fewer.'),
  role: TeamMemberApprovalRoleSchema,
});

export type TeamMemberInvite = z.infer<typeof TeamMemberInviteSchema>;

export const AcceptTeamMemberInviteSchema = z.object({
  token: z.string().uuid(),
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required.')
    .max(120, 'Full name must be 120 characters or fewer.'),
  password: z.string().min(8, 'Use at least 8 characters for your password.'),
});

export type AcceptTeamMemberInvite = z.infer<typeof AcceptTeamMemberInviteSchema>;
