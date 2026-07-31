/**
 * Capability-based authorization. Server actions should check a capability
 * (`hasCapability(role, 'canVoidInvoices')`), never a hardcoded role name —
 * that keeps call sites stable if a finer-grained role (e.g. "office
 * manager") is added later; only the CAPABILITIES map below needs to change.
 *
 * Mirrors the `user_role` Postgres enum (0001_init.sql) as a local literal
 * union rather than importing from @premier/db, since packages/shared has no
 * dependency on packages/db.
 */
export type OrgRole = 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer';

export type Capability =
  | 'canCreateEstimates'
  | 'canSendEstimates'
  | 'canCreateInvoices'
  | 'canSendInvoices'
  | 'canRecordPayments'
  | 'canVoidInvoices'
  | 'canDeleteInvoices'
  | 'canIssueRefunds'
  | 'canScheduleJobs'
  | 'canProposeChangeOrders'
  | 'canManageDeposits'
  | 'canEditWorkingInvoice';

/**
 * Day-to-day estimate/invoice creation and sending is normal operations for
 * any trusted staff member. Actions that alter financial history (payments,
 * voids, deletes, refunds) require owner/admin — see MEMORY.md-adjacent
 * decision: this is a deliberate product boundary, not just a security
 * restriction, and `viewer` never gets write capabilities of any kind.
 */
const CAPABILITIES: Record<Capability, readonly OrgRole[]> = {
  canCreateEstimates: ['owner', 'admin', 'employee', 'subcontractor'],
  canSendEstimates: ['owner', 'admin', 'employee', 'subcontractor'],
  canCreateInvoices: ['owner', 'admin', 'employee', 'subcontractor'],
  canSendInvoices: ['owner', 'admin', 'employee', 'subcontractor'],
  canRecordPayments: ['owner', 'admin'],
  canVoidInvoices: ['owner', 'admin'],
  canDeleteInvoices: ['owner', 'admin'],
  canIssueRefunds: ['owner', 'admin'],
  canScheduleJobs: ['owner', 'admin', 'employee', 'subcontractor'],
  // Field staff may draft/propose a change order; only the customer's
  // response makes it contractual (approve_response RPC is customer-only,
  // enforced at the database layer independent of this app-level check —
  // see change_order_rpc_functions.sql). Staff never self-approve.
  canProposeChangeOrders: ['owner', 'admin', 'employee', 'subcontractor'],
  canManageDeposits: ['owner', 'admin'],
  canEditWorkingInvoice: ['owner', 'admin', 'employee', 'subcontractor'],
};

export function hasCapability(role: OrgRole, capability: Capability): boolean {
  return CAPABILITIES[capability].includes(role);
}
