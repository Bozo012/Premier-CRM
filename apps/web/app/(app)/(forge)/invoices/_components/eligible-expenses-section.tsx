import { Receipt, ReceiptText } from 'lucide-react';

import { ForgeCard, ForgeSectionTitle } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';

import type { ForgeEligibleExpenseOption } from '../_lib/forge-invoice-eligible-expenses-view-model';
import { addExpenseChargeToInvoiceAction } from '../actions';

/**
 * Ported from Base44's InvoiceEligibleExpenses.tsx (src/components/forge/
 * invoices/InvoiceEligibleExpenses.tsx) — forge-border/forge-card/
 * forge-muted-foreground/forge-primary tokens mapped onto this app's
 * existing border/bg-card/text-muted-foreground/bg-primary tokens, matching
 * every other ported presentation component in this program. Base44's
 * version renders Forge-supplied `actions` per row; this real-backend port
 * only ever offers one real action — "Add to invoice" — since that is the
 * only mutation this codebase's query layer actually supports today.
 */
export function EligibleExpensesSection({
  expenses,
  invoiceId,
}: {
  expenses: ForgeEligibleExpenseOption[];
  invoiceId: string;
}) {
  return (
    <section aria-labelledby="eligible-expenses-heading" className="space-y-3">
      <div>
        <ForgeSectionTitle>
          <span id="eligible-expenses-heading">Eligible expenses</span>
        </ForgeSectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Only approved expenses whose billing treatment allows a customer charge, and that are not
          already linked to another invoice, appear here.
        </p>
      </div>

      {expenses.length === 0 ? (
        <ForgeCard className="border-dashed text-center">
          <ReceiptText className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-foreground">No eligible expenses</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal-only, rejected, voided, in-scope, and already-invoiced costs never appear here.
          </p>
        </ForgeCard>
      ) : (
        <ul className="space-y-3">
          {expenses.map((expense) => (
            <li key={expense.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{expense.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {expense.categoryLabel} · {expense.vendor}
                  </p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {[
                  ['Original cost', expense.originalCostLabel],
                  ['Billing treatment', expense.billingTreatmentLabel],
                  ['Customer charge', expense.customerChargeLabel],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 text-xs">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {expense.receiptLabel}
              </p>

              <form action={addExpenseChargeToInvoiceAction} className="mt-3">
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="expenseId" value={expense.id} />
                <Button type="submit" size="sm" className="min-h-9 rounded-xl font-bold">
                  Add to invoice
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700">
        An expense records what Premier paid. The customer charge is a separately reviewed value —
        adding an expense here snapshots its cost and charge amount at that moment; later edits to the
        expense do not rewrite the invoice line item.
      </p>
    </section>
  );
}
