'use client';
// Client component: manages add/edit/remove form state for quote line items.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';

import type { CatalogItemForPicker, QuoteLineItemSummary } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  addLineItemAction,
  removeLineItemAction,
  updateLineItemAction,
  type LineItemActionState,
} from '../actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItemEditorProps {
  catalogItems: CatalogItemForPicker[];
  lineItems: QuoteLineItemSummary[];
  quoteId: string;
}

interface LineItemFormValues {
  description: string;
  markupPct: string;
  name: string;
  quantity: string;
  serviceId: string;
  unit: string;
  unitPrice: string;
}

const EMPTY_FORM: LineItemFormValues = {
  description: '',
  markupPct: '',
  name: '',
  quantity: '1',
  serviceId: '',
  unit: 'each',
  unitPrice: '0',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatQty(value: number): string {
  return Number(value).toString();
}

function formValuesFromLineItem(
  item: QuoteLineItemSummary['item']
): LineItemFormValues {
  return {
    description: item.description ?? '',
    markupPct: item.markup_pct != null ? String(item.markup_pct) : '',
    name: item.name,
    quantity: String(item.quantity),
    serviceId: item.service_id ?? '',
    unit: item.unit,
    unitPrice: String(item.unit_price),
  };
}

// Groups catalog items by category name for the <optgroup> picker.
function groupCatalogItems(
  items: CatalogItemForPicker[]
): { categoryName: string; items: CatalogItemForPicker[] }[] {
  const grouped = new Map<string, CatalogItemForPicker[]>();

  for (const item of items) {
    const key = item.categoryName ?? 'Uncategorized';
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categoryName, catItems]) => ({ categoryName, items: catItems }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LineItemFormProps {
  catalogGroups: { categoryName: string; items: CatalogItemForPicker[] }[];
  error: string | null;
  initialValues?: LineItemFormValues;
  isPending: boolean;
  lineItemId?: string;
  onCancel: () => void;
  quoteId: string;
  submitLabel: string;
  submitAction: (
    prevState: LineItemActionState | null,
    formData: FormData
  ) => Promise<LineItemActionState>;
}

function LineItemForm({
  catalogGroups,
  error,
  initialValues = EMPTY_FORM,
  isPending,
  lineItemId,
  onCancel,
  quoteId,
  submitLabel,
  submitAction,
}: LineItemFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<LineItemFormValues>(initialValues);
  const [, formAction, isActionPending] = useActionState(
    submitAction,
    null
  );
  const [isTransitionPending, startTransition] = useTransition();

  const isSubmitting = isPending || isActionPending || isTransitionPending;

  // When a catalog item is selected, pre-fill the form fields.
  function handleCatalogSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const serviceId = e.target.value;
    setValues((prev) => ({ ...prev, serviceId }));

    if (!serviceId) return;

    const allItems = catalogGroups.flatMap((g) => g.items);
    const found = allItems.find((item) => item.id === serviceId);
    if (!found) return;

    const price = found.rateConfirmed ?? found.defaultUnitPrice ?? 0;
    setValues({
      description: '',
      markupPct: '',
      name: found.name,
      quantity: '1',
      serviceId,
      unit: found.unit,
      unitPrice: String(price),
    });
  }

  function handleField(key: keyof LineItemFormValues) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
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
      {/* Hidden fields */}
      <input type="hidden" name="quoteId" value={quoteId} />
      {lineItemId ? (
        <input type="hidden" name="lineItemId" value={lineItemId} />
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Catalog picker — only shown in "add" mode (no lineItemId) */}
      {!lineItemId && catalogGroups.length > 0 ? (
        <div className="space-y-1">
          <Label htmlFor="catalog-picker">Pre-fill from catalog</Label>
          <select
            id="catalog-picker"
            value={values.serviceId}
            onChange={handleCatalogSelect}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Manual entry —</option>
            {catalogGroups.map((group) => (
              <optgroup key={group.categoryName} label={group.categoryName}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* serviceId hidden field so the action receives it */}
          <input type="hidden" name="serviceId" value={values.serviceId} />
        </div>
      ) : null}

      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="li-name">Name *</Label>
        <Input
          id="li-name"
          name="name"
          required
          value={values.name}
          onChange={handleField('name')}
          placeholder="e.g. Drywall patch and paint"
          maxLength={200}
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="li-description">Description</Label>
        <textarea
          id="li-description"
          name="description"
          value={values.description}
          onChange={handleField('description')}
          placeholder="Optional detail for the customer"
          maxLength={1000}
          rows={2}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Unit / Quantity / Unit price */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="li-unit">Unit *</Label>
          <Input
            id="li-unit"
            name="unit"
            required
            value={values.unit}
            onChange={handleField('unit')}
            placeholder="each"
            maxLength={50}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="li-quantity">Quantity *</Label>
          <Input
            id="li-quantity"
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
          <Label htmlFor="li-unit-price">Unit price ($) *</Label>
          <Input
            id="li-unit-price"
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

      {/* Markup */}
      <div className="space-y-1">
        <Label htmlFor="li-markup">Markup (%)</Label>
        <Input
          id="li-markup"
          name="markupPct"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={values.markupPct}
          onChange={handleField('markupPct')}
          placeholder="Optional"
          className="max-w-[12rem]"
        />
        <p className="text-xs text-muted-foreground">
          Stored for reference. Unit price should already include any markup.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} size="sm">
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function LineItemEditor({
  catalogItems,
  lineItems,
  quoteId,
}: LineItemEditorProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemovePending, startRemoveTransition] = useTransition();

  const catalogGroups = groupCatalogItems(catalogItems);

  // Clear errors when the relevant panel closes.
  useEffect(() => {
    if (!showAddForm) setAddError(null);
  }, [showAddForm]);
  useEffect(() => {
    if (!editingId) setEditError(null);
  }, [editingId]);

  function handleRemove(lineItemId: string) {
    setRemovingId(lineItemId);
    setRemoveError(null);

    const fd = new FormData();
    fd.set('lineItemId', lineItemId);
    fd.set('quoteId', quoteId);

    startRemoveTransition(async () => {
      const result = await removeLineItemAction(null, fd);
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
      {/* Error from remove */}
      {removeError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {removeError}
        </p>
      ) : null}

      {/* Existing line items */}
      {lineItems.length > 0 ? (
        <ul className="space-y-3">
          {lineItems.map(({ item, service, phaseName }) => (
            <li key={item.id} className="rounded-md border">
              {editingId === item.id ? (
                <div className="p-3">
                  <LineItemForm
                    catalogGroups={catalogGroups}
                    error={editError}
                    initialValues={formValuesFromLineItem(item)}
                    isPending={false}
                    lineItemId={item.id}
                    onCancel={() => setEditingId(null)}
                    quoteId={quoteId}
                    submitLabel="Save changes"
                    submitAction={updateLineItemAction}
                  />
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.service_id ? (
                          <Link href={`/services/${item.service_id}`} className="hover:underline">
                            {service?.name ?? 'Catalog service'}
                          </Link>
                        ) : (
                          'Manual'
                        )}
                        {[phaseName, item.unit].filter(Boolean).length > 0
                          ? ` · ${[phaseName, item.unit].filter(Boolean).join(' · ')}`
                          : null}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-foreground">
                      {formatMoney(item.total_quoted)}
                    </p>
                  </div>

                  {item.description ? (
                    <p className="mt-1 text-sm text-foreground">
                      {item.description}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">Qty:</span>{' '}
                      {formatQty(item.quantity)} {item.unit}
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        Unit price:
                      </span>{' '}
                      {formatMoney(item.unit_price)}
                    </span>
                    {item.markup_pct != null ? (
                      <span>
                        <span className="font-medium text-foreground">
                          Markup:
                        </span>{' '}
                        {item.markup_pct}%
                      </span>
                    ) : null}
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
                      {isRemovePending && removingId === item.id
                        ? 'Removing…'
                        : 'Remove'}
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

      {/* Add form */}
      {showAddForm ? (
        <LineItemForm
          catalogGroups={catalogGroups}
          error={addError}
          isPending={false}
          onCancel={() => setShowAddForm(false)}
          quoteId={quoteId}
          submitLabel="Add line item"
          submitAction={addLineItemAction}
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
