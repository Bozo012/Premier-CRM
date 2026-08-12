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
  | 'canEditWorkingInvoice'
  | 'canTriageRequests'
  | 'canCreateDirectWorkOrder'
  | 'canManageInspectionTemplates'
  | 'canEditEstimate'
  | 'canApproveEstimatePricing'
  | 'canCreateQuote'
  | 'canSendQuote'
  | 'canCreateExpenses'
  | 'canApproveExpenses'
  | 'canPublishCustomerMedia';

/**
 * Day-to-day estimate/invoice creation and sending is normal operations for
 * any trusted staff member. Actions that alter financial history (payments,
 * voids, deletes, refunds) require owner/admin — see MEMORY.md-adjacent
 * decision: this is a deliberate product boundary, not just a security
 * restriction, and `viewer` never gets write capabilities of any kind.
 */
export const CAPABILITIES: Record<Capability, readonly OrgRole[]> = {
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

  // Request → site visit → estimate workflow (see
  // docs/implementation/request-site-visit-estimate-workflow.md). This is
  // the canonical capability matrix — packages/db's SQL
  // role_has_capability() function must be kept in exact sync with this
  // map (see the automated parity test); a mismatch is a security defect,
  // not a UX bug, since the SQL side is the real enforcement boundary.
  canTriageRequests: ['owner', 'admin', 'employee', 'subcontractor'],
  // Deliberately narrower than canTriageRequests — direct work orders skip
  // quoting/pricing review entirely and must not become a casual bypass.
  canCreateDirectWorkOrder: ['owner', 'admin'],
  canManageInspectionTemplates: ['owner', 'admin'],
  canEditEstimate: ['owner', 'admin', 'employee', 'subcontractor'],
  // Pricing approval is deliberately owner/admin-only for now — whether to
  // extend this to employee is an open business-policy decision, not a
  // technical default (see the implementation doc's "Open decisions"
  // section). Subcontractors never get this, regardless of future changes.
  canApproveEstimatePricing: ['owner', 'admin'],
  // Creating/sending a quote is separate from approving its pricing — an
  // owner/admin can approve pricing and an employee can then create and
  // send the resulting quote without ever holding pricing-approval
  // authority. Subcontractors get neither.
  canCreateQuote: ['owner', 'admin', 'employee'],
  canSendQuote: ['owner', 'admin', 'employee'],

  // Base44-exact-finance slice: expense create/submit and expense
  // approve/reject/void previously reused canCreateInvoices/
  // canRecordPayments/canVoidInvoices as stand-ins (there was no
  // expense-specific capability at all). These give expenses their own
  // named capabilities with the exact same role sets those stand-ins had,
  // so this is a pure rename/clarification, not a permissions change.
  canCreateExpenses: ['owner', 'admin', 'employee', 'subcontractor'],
  canApproveExpenses: ['owner', 'admin'],

  // Customer-Safe Photo Visibility (docs/implementation/customer-safe-photo-
  // visibility-design.md, PR #141). Deliberately narrower than
  // canScheduleJobs (which still governs who may upload job/estimate
  // photos, unchanged): publishing a photo to the customer portal is an
  // outward-facing authorization decision, not routine field-staff media
  // work, so employee/subcontractor never get it regardless of what other
  // media capabilities they hold.
  canPublishCustomerMedia: ['owner', 'admin'],
};

export function hasCapability(role: OrgRole, capability: Capability): boolean {
  return CAPABILITIES[capability].includes(role);
}
