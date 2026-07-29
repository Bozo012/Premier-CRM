export type RequestIntakePath = 'inspection' | 'work_order' | 'unassigned';

export function getRequestIntakePath(args: {
  estimateId?: string | null;
  jobId?: string | null;
}): RequestIntakePath {
  if (args.estimateId) return 'inspection';
  if (args.jobId) return 'work_order';
  return 'unassigned';
}

export function getRequestIntakePathLabel(path: RequestIntakePath): string | null {
  switch (path) {
    case 'inspection':
      return 'Inspection flow';
    case 'work_order':
      return 'Work-order path';
    default:
      return null;
  }
}

export function getPortalRequestStatusLabel(args: {
  estimateId?: string | null;
  jobId?: string | null;
  status: string;
}): string {
  switch (args.status) {
    case 'new':
      return 'Submitted';
    case 'reviewing':
      return 'Viewed';
    case 'estimate_created':
      return 'Estimate in progress';
    case 'approved':
      return args.jobId ? 'Work order created' : 'Approved';
    case 'scheduled':
      return args.jobId ? 'Work scheduled' : 'Scheduled';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'spam':
      return 'Closed';
    default:
      return args.status.replace(/_/g, ' ');
  }
}

export function getPortalRequestStatusDescription(args: {
  estimateId?: string | null;
  jobId?: string | null;
  status: string;
}): string | null {
  switch (args.status) {
    case 'new':
      return 'We received your request and it is waiting for review.';
    case 'reviewing':
      return 'Premier has reviewed your request and is deciding the next step.';
    case 'estimate_created':
      return 'Your request is in the inspection-and-estimate flow.';
    case 'approved':
      return args.jobId
        ? 'Your request has been turned into a work order and will be scheduled next.'
        : 'Your request was approved.';
    case 'scheduled':
      return args.jobId ? 'Your work order has been scheduled.' : 'This request has been scheduled.';
    case 'in_progress':
      return 'Work is currently underway.';
    case 'completed':
      return 'This request has been completed.';
    case 'cancelled':
      return 'This request was cancelled.';
    default:
      return null;
  }
}
