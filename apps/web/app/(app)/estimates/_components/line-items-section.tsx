'use client';

// Client component: inline add/edit/delete of estimate line items with
// server-action submission and optimistic-free refresh-on-success.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { EstimateLineItem } from '@premier/db';

import {
  createEstimateLineItemAction,
  updateEstimateLineItemAction,
  deleteEstimateLineItemAction,
} from '../actions';

interface LineItemsSectionProps {
  estimateId: string;
  lineItems: EstimateLineItem[];
  locked: boolean;
}

export function LineItemsSection({ estimateId, lineItems, locked }: LineItemsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const total = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleDelete = (lineItemId: string) => {
    const fd = new FormData();
    fd.set('lineItemId', lineItemId);
    fd.set('estimateId', estimateId);
    startTransition(async () => {
      const result = await deleteEstimateLineItemAction(null, fd);
      if (result.success) {
        toast.success('Line item removed.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to remove line item.');
      }
    });
  };

  return (
    <section className="space-y-3 rounded-md border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line items</h2>
        <span className="text-sm font-medium text-foreground">{formatMoney(total)}</span>
      </div>

      {lineItems.length === 0 && !addingNew ? (
        <p className="text-sm text-muted-foreground">No line items yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {lineItems.map((item) =>
            editingId === item.id ? (
              <LineItemEditRow
                key={item.id}
                estimateId={estimateId}
                item={item}
                onDone={() => {
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">
                    {item.description}
                    {item.isSystemSuggested ? (
                      <span className="ml-2 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        System-suggested
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatMoney(item.unitPrice)} = {formatMoney(item.quantity * item.unitPrice)}
                  </p>
                </div>
                {!locked ? (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setEditingId(item.id)} className="text-xs font-medium underline-offset-2 hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="text-xs font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            )
          )}
        </ul>
      )}

      {!locked ? (
        addingNew ? (
          <LineItemEditRow
            estimateId={estimateId}
            sortOrder={lineItems.length}
            onDone={() => {
              setAddingNew(false);
              router.refresh();
            }}
            onCancel={() => setAddingNew(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            + Add line item
          </button>
        )
      ) : (
        <p className="text-xs text-muted-foreground">Line items are locked — pricing has been approved.</p>
      )}
    </section>
  );
}

function LineItemEditRow({
  estimateId,
  item,
  sortOrder,
  onDone,
  onCancel,
}: {
  estimateId: string;
  item?: EstimateLineItem;
  sortOrder?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('estimateId', estimateId);
    startTransition(async () => {
      const result = item
        ? await updateEstimateLineItemAction(null, (() => {
            fd.set('lineItemId', item.id);
            return fd;
          })())
        : await createEstimateLineItemAction(null, (() => {
            fd.set('sortOrder', String(sortOrder ?? 0));
            return fd;
          })());
      if (result.success) {
        toast.success(item ? 'Line item updated.' : 'Line item added.');
        onDone();
      } else {
        toast.error(result.error ?? 'Failed to save line item.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 border-b px-3 py-2 last:border-b-0">
      <input
        name="description"
        type="text"
        placeholder="Description"
        required
        defaultValue={item?.description}
        className="h-8 min-w-[160px] flex-1 rounded-md border border-input bg-background px-2 text-sm"
      />
      <input
        name="quantity"
        type="number"
        step="0.01"
        placeholder="Qty"
        defaultValue={item?.quantity ?? 1}
        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
      />
      <input
        name="unitPrice"
        type="number"
        step="0.01"
        placeholder="Unit price"
        defaultValue={item?.unitPrice ?? 0}
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
      <button type="button" onClick={onCancel} className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground">
        Cancel
      </button>
    </form>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}
