import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'lead',
  'site_visit_scheduled',
  'quoted',
  'approved',
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
  'paid',
  'cancelled',
  'on_hold',
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ListJobsArgsSchema = z.object({
  orgId: z.string().uuid(),
  search: z.string().trim().min(1).max(200).optional(),
  status: JobStatusSchema.optional(),
  statuses: z.array(JobStatusSchema).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ListJobsArgs = z.infer<typeof ListJobsArgsSchema>;
