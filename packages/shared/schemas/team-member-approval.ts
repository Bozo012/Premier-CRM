import { z } from 'zod';

export const TeamMemberApprovalRoleSchema = z.enum([
  'admin',
  'employee',
  'subcontractor',
  'viewer',
]);

export const TeamMemberApprovalStatusSchema = z.enum(['active', 'rejected']);

export const TeamMemberApprovalSchema = z
  .object({
    memberId: z.string().uuid(),
    role: TeamMemberApprovalRoleSchema.optional(),
    status: TeamMemberApprovalStatusSchema,
  })
  .superRefine((value, context) => {
    if (value.status === 'active' && !value.role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A role is required when approving a team member.',
        path: ['role'],
      });
    }
  });

export type TeamMemberApproval = z.infer<typeof TeamMemberApprovalSchema>;
export type TeamMemberApprovalRole = z.infer<
  typeof TeamMemberApprovalRoleSchema
>;
export type TeamMemberApprovalStatus = z.infer<
  typeof TeamMemberApprovalStatusSchema
>;
