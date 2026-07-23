'use client';
// Client component: manages add/edit/remove form state for invoice line items.
// Unlike quote_line_items, invoice_line_items has no service_id column (no
// catalog link) — invoice line items are always manual entries or snapshots
// copied from a quote at creation time, never re-linked to the catalog.

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { InvoiceLineItemSummary } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  addInvoiceLineItemAction,
  removeInvoiceLineItemAction,
  updateInvoiceLineItemAction,
  type LineItemActionState,
} from '../actions';

interface LineItemEditorProps {
  invoiceId: string;
  lineItems: InvoiceLineItemSummary[];
}

interface LineItemFormValues {
  description: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const EMPTY_FORM: LineItemFormValues = {
  description: '',
  name: '',
  quantity: '1',
  unit: 'each',
  unitPrice: '0',
};

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

function formatQty(value: number): string {
  return Number(value).toString();
}

function formValuesFromLineItem(
  item: InvoiceLineItemSummary['item']
): LineItemFormValues {
  return {
    description: item.description ?? '',
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPrice: String(item.unit_price),
  };
}

interface LineItemFormProps {
  error: string | null;
  initialValues?: LineItemFormValues;
  invoiceId: string;
  lineItemId?: string;
  onCancel: () => void;
  submitAction: (
    prevState: LineItemActionState | null,
    formData: FormData
  ) => Promise<LineItemActionState>;
  submitLabel: string;
}

function LineItemForm({
  error,
  initialValues = EMPTY_FORM,
  invoiceId,
  lineItemId,
  onCancel,
  submitAction,
  submitLabel,
}: LineItemFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<LineItemFormValues>(initialValues);
  const [isTransitionPending, startTransition] = useTransition();

  function handleField(key: keyof LineItemFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((prev) => ({ ...prev, [key]: e.target.value }));
    };
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitAction(null, fd);
      if (result.success) {
        router.refresh();
        onCancel();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border p-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {lineItemId ? <input type="hidden" name="lineItemId" value={lineItemId} /> : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="ili-name">Name *</Label>
        <Input
          id="ili-name"
          name="name"
          required
          value={values.name}
          onChange={handleField('name')}
          placeholder="e.g. Drywall patch and paint"
          maxLength={200}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="ili-description">Description</Label>
        <textarea
          id="ili-description"
          name="description"
          value={values.description}
          onChange={handleField('description')}
          placeholder="Optional detail for the customer"
          maxLength={1000}
          rows={2}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="ili-unit">Unit *</Label>
          <Input
            id="ili-unit"
            name="unit"
            required
            value={values.unit}
            onChange={handleField('unit')}
            placeholder="each"
            maxLength={50}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ili-quantity">Quantity *</Label>
          <Input
            id="ili-quantity"
            name="quantity"
            type="number"
            required
            min="0.001"
            step="any"
            value={values.quantity}
            onChange={handleField('quantity')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ili-unit-price">Unit price ($) *</Label>
          <Input
            id="ili-unit-price"
            name="unitPrice"
            type="number"
            required
            min="0"
            step="0.01"
            value={values.unitPrice}
            onChange={handleField('unitPrice')}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isTransitionPending} size="sm">
          {isTransitionPending ? 'Saving…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isTransitionPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function LineItemEditor({ invoiceId, lineItems }: LineItemEditorProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemovePending, startRemoveTransition] = useTransition();

  function handleRemove(lineItemId: string) {
    setRemovingId(lineItemId);
    setRemoveError(null);

    const fd = new FormData();
    fd.set('lineItemId', lineItemId);
    fd.set('invoiceId', invoiceId);

    startRemoveTransition(async () => {
      const result = await removeInvoiceLineItemAction(null, fd);
      if (result.success) {
        router.refresh();
      } else {
        setRemoveError(result.error ?? 'Failed to remove line item.');
      }
      setRemovingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {removeError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {removeError}
        </p>
      ) : null}

      {lineItems.length > 0 ? (
        <ul className="space-y-3">
          {lineItems.map(({ item }) => (
            <li key={item.id} className="rounded-md border">
              {editingId === item.id ? (
                <div className="p-3">
                  <LineItemForm
                    error={null}
                    initialValues={formValuesFromLineItem(item)}
                    invoiceId={invoiceId}
                    lineItemId={item.id}
                    onCancel={() => setEditingId(null)}
                    submitAction={updateInvoiceLineItemAction}
                    submitLabel="Save changes"
                  />
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[item.quote_line_id ? 'From quote' : 'Manual', item.unit]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-foreground">
                      {formatMoney(item.total)}
                    </p>
                  </div>

                  {item.description ? (
                    <p className="mt-1 text-sm text-foreground">{item.description}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">Qty:</span>{' '}
                      {formatQty(item.quantity)} {item.unit}
                    </span>
                    <span>
                      <span className="font-medium text-foreground">Unit price:</span>{' '}
                      {formatMoney(item.unit_price)}
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setShowAddForm(false);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRemovePending && removingId === item.id}
                      onClick={() => handleRemove(item.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      {isRemovePending && removingId === item.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No line items yet. Add the first one below.
        </p>
      )}

      {showAddForm ? (
        <LineItemForm
          error={null}
          invoiceId={invoiceId}
          onCancel={() => setShowAddForm(false)}
          submitAction={addInvoiceLineItemAction}
          submitLabel="Add line item"
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setShowAddForm(true);
            setEditingId(null);
          }}
        >
          + Add line item
        </Button>
      )}
    </div>
  );
}
