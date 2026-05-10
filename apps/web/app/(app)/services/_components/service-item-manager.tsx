'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import type {
  ServiceCatalogCategorySummary,
  ServiceCatalogItemSummary,
} from '@premier/db';
import {
  ServiceItemInputSchema,
  type ServiceCatalogConfidence,
  type ServicePricingMetric,
} from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  saveServiceItemAction,
  type SaveServiceItemActionState,
} from '../actions';

type ServiceItemFormValues = z.input<typeof ServiceItemInputSchema>;

interface ServiceItemGroup {
  category: { id: string; name: string };
  items: ServiceCatalogItemSummary[];
}

interface ServiceItemManagerProps {
  categories: ServiceCatalogCategorySummary[];
  groupedItems: ServiceItemGroup[];
}

const CONFIDENCE_OPTIONS: ServiceCatalogConfidence[] = [
  'unconfirmed',
  'low',
  'medium',
  'high',
];

const PRICING_METRIC_OPTIONS: ServicePricingMetric[] = [
  'flat',
  'per_sqft',
  'per_lf',
  'per_each',
  'per_hour',
  'quote_per_job',
  'surcharge_pct',
];

function buildItemDefaults(
  itemSummary?: ServiceCatalogItemSummary
): ServiceItemFormValues {
  return {
    id: itemSummary?.item.id,
    categoryId: itemSummary?.item.category_id ?? '',
    commonAddons: itemSummary?.item.common_addons ?? '',
    confidence:
      (itemSummary?.item.confidence as ServiceCatalogConfidence | null) ??
      'unconfirmed',
    defaultLaborMinutes: itemSummary?.item.default_labor_minutes ?? '',
    defaultMarkupPct: itemSummary?.item.default_markup_pct ?? '',
    defaultUnitPrice: itemSummary?.item.default_unit_price ?? '',
    description: itemSummary?.item.description ?? '',
    exclusionNote: itemSummary?.item.exclusion_note ?? '',
    isActive: itemSummary?.item.is_active ?? true,
    isCustomOnly: itemSummary?.item.is_custom_only ?? false,
    name: itemSummary?.item.name ?? '',
    pricingMetric:
      (itemSummary?.item.pricing_metric as ServicePricingMetric | null) ?? 'flat',
    rateConfirmed: itemSummary?.item.rate_confirmed ?? '',
    rateHigh: itemSummary?.item.rate_high ?? '',
    rateLow: itemSummary?.item.rate_low ?? '',
    scopeExcludes: itemSummary?.item.scope_excludes ?? '',
    scopeIncludes: itemSummary?.item.scope_includes ?? '',
    unit: itemSummary?.item.unit ?? '',
    unitLabel: itemSummary?.item.unit_label ?? '',
  };
}

function appendFormValue(formData: FormData, key: string, value: unknown) {
  if (value === null || value === undefined) {
    formData.append(key, '');
    return;
  }

  formData.append(key, String(value));
}

export function ServiceItemManager({
  categories,
  groupedItems,
}: ServiceItemManagerProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Services</h2>
        <p className="text-sm text-muted-foreground">
          Edit the catalog fields already present in the schema: pricing confidence, range, confirmed rate, scope notes, and activation state.
        </p>
      </div>

      <ServiceItemEditorCard categories={categories} />

      <div className="space-y-5">
        {groupedItems.map((group) => (
          <section key={group.category.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {group.category.name}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {group.items.length} {group.items.length === 1 ? 'service' : 'services'}
              </span>
            </div>

            <div className="space-y-3">
              {group.items.map((itemSummary) => (
                <ServiceItemEditorCard
                  key={itemSummary.item.id}
                  categories={categories}
                  itemSummary={itemSummary}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ServiceItemEditorCard({
  categories,
  itemSummary,
}: {
  categories: ServiceCatalogCategorySummary[];
  itemSummary?: ServiceCatalogItemSummary;
}) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    SaveServiceItemActionState | null,
    FormData
  >(saveServiceItemAction, null);

  const defaultValues = useMemo(
    () => buildItemDefaults(itemSummary),
    [itemSummary]
  );

  const form = useForm<ServiceItemFormValues>({
    defaultValues,
    resolver: zodResolver(ServiceItemInputSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    if (!itemSummary) {
      form.reset(buildItemDefaults());
    }

    router.refresh();
  }, [form, itemSummary, router, state]);

  const isPending = isActionPending || isTransitionPending;

  const onSubmit = form.handleSubmit((values) => {
    const nextFormData = new FormData();

    appendFormValue(nextFormData, 'id', values.id);
    appendFormValue(nextFormData, 'categoryId', values.categoryId);
    appendFormValue(nextFormData, 'commonAddons', values.commonAddons);
    appendFormValue(nextFormData, 'confidence', values.confidence);
    appendFormValue(
      nextFormData,
      'defaultLaborMinutes',
      values.defaultLaborMinutes
    );
    appendFormValue(nextFormData, 'defaultMarkupPct', values.defaultMarkupPct);
    appendFormValue(nextFormData, 'defaultUnitPrice', values.defaultUnitPrice);
    appendFormValue(nextFormData, 'description', values.description);
    appendFormValue(nextFormData, 'exclusionNote', values.exclusionNote);
    appendFormValue(nextFormData, 'isActive', values.isActive);
    appendFormValue(nextFormData, 'isCustomOnly', values.isCustomOnly);
    appendFormValue(nextFormData, 'name', values.name);
    appendFormValue(nextFormData, 'pricingMetric', values.pricingMetric);
    appendFormValue(nextFormData, 'rateConfirmed', values.rateConfirmed);
    appendFormValue(nextFormData, 'rateHigh', values.rateHigh);
    appendFormValue(nextFormData, 'rateLow', values.rateLow);
    appendFormValue(nextFormData, 'scopeExcludes', values.scopeExcludes);
    appendFormValue(nextFormData, 'scopeIncludes', values.scopeIncludes);
    appendFormValue(nextFormData, 'unit', values.unit);
    appendFormValue(nextFormData, 'unitLabel', values.unitLabel);

    startTransition(() => {
      formAction(nextFormData);
    });
  });

  const content = (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-2">
          <Label htmlFor={`service-item-name-${itemSummary?.item.id ?? 'new'}`}>
            Service name
          </Label>
          <Input
            id={`service-item-name-${itemSummary?.item.id ?? 'new'}`}
            {...form.register('name')}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-category-${itemSummary?.item.id ?? 'new'}`}>
            Category
          </Label>
          <select
            id={`service-item-category-${itemSummary?.item.id ?? 'new'}`}
            {...form.register('categoryId')}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError message={form.formState.errors.categoryId?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-unit-${itemSummary?.item.id ?? 'new'}`}>
            Unit
          </Label>
          <Input
            id={`service-item-unit-${itemSummary?.item.id ?? 'new'}`}
            placeholder="each"
            {...form.register('unit')}
          />
          <FieldError message={form.formState.errors.unit?.message} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={`service-item-unit-label-${itemSummary?.item.id ?? 'new'}`}>
            Unit label
          </Label>
          <Input
            id={`service-item-unit-label-${itemSummary?.item.id ?? 'new'}`}
            placeholder="per door"
            {...form.register('unitLabel')}
          />
          <FieldError message={form.formState.errors.unitLabel?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-metric-${itemSummary?.item.id ?? 'new'}`}>
            Pricing metric
          </Label>
          <select
            id={`service-item-metric-${itemSummary?.item.id ?? 'new'}`}
            {...form.register('pricingMetric')}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {PRICING_METRIC_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatEnumLabel(option)}
              </option>
            ))}
          </select>
          <FieldError message={form.formState.errors.pricingMetric?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-confidence-${itemSummary?.item.id ?? 'new'}`}>
            Confidence
          </Label>
          <select
            id={`service-item-confidence-${itemSummary?.item.id ?? 'new'}`}
            {...form.register('confidence')}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CONFIDENCE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatEnumLabel(option)}
              </option>
            ))}
          </select>
          <FieldError message={form.formState.errors.confidence?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-default-price-${itemSummary?.item.id ?? 'new'}`}>
            Default unit price
          </Label>
          <Input
            id={`service-item-default-price-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="0.01"
            {...form.register('defaultUnitPrice')}
          />
          <FieldError message={form.formState.errors.defaultUnitPrice?.message} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`service-item-rate-low-${itemSummary?.item.id ?? 'new'}`}>
            Rate low
          </Label>
          <Input
            id={`service-item-rate-low-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="0.01"
            {...form.register('rateLow')}
          />
          <FieldError message={form.formState.errors.rateLow?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-rate-high-${itemSummary?.item.id ?? 'new'}`}>
            Rate high
          </Label>
          <Input
            id={`service-item-rate-high-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="0.01"
            {...form.register('rateHigh')}
          />
          <FieldError message={form.formState.errors.rateHigh?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-rate-confirmed-${itemSummary?.item.id ?? 'new'}`}>
            Confirmed rate
          </Label>
          <Input
            id={`service-item-rate-confirmed-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="0.01"
            {...form.register('rateConfirmed')}
          />
          <FieldError message={form.formState.errors.rateConfirmed?.message} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`service-item-labor-${itemSummary?.item.id ?? 'new'}`}>
            Default labor minutes
          </Label>
          <Input
            id={`service-item-labor-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="1"
            {...form.register('defaultLaborMinutes')}
          />
          <FieldError message={form.formState.errors.defaultLaborMinutes?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-markup-${itemSummary?.item.id ?? 'new'}`}>
            Default markup %
          </Label>
          <Input
            id={`service-item-markup-${itemSummary?.item.id ?? 'new'}`}
            type="number"
            min="0"
            step="0.01"
            {...form.register('defaultMarkupPct')}
          />
          <FieldError message={form.formState.errors.defaultMarkupPct?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-item-description-${itemSummary?.item.id ?? 'new'}`}>
            Description
          </Label>
          <textarea
            id={`service-item-description-${itemSummary?.item.id ?? 'new'}`}
            rows={3}
            {...form.register('description')}
            className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <FieldError message={form.formState.errors.description?.message} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaField
          form={form}
          id={`service-item-includes-${itemSummary?.item.id ?? 'new'}`}
          label="Scope includes"
          name="scopeIncludes"
        />
        <TextAreaField
          form={form}
          id={`service-item-excludes-${itemSummary?.item.id ?? 'new'}`}
          label="Scope excludes"
          name="scopeExcludes"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaField
          form={form}
          id={`service-item-addons-${itemSummary?.item.id ?? 'new'}`}
          label="Common addons"
          name="commonAddons"
        />
        <TextAreaField
          form={form}
          id={`service-item-exclusion-note-${itemSummary?.item.id ?? 'new'}`}
          label="Exclusion note"
          name="exclusionNote"
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" {...form.register('isActive')} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" {...form.register('isCustomOnly')} />
          Custom only
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? 'Saving...'
            : itemSummary
              ? 'Save service'
              : 'Create service'}
        </Button>
      </div>

      {state?.success ? (
        <p className="text-sm text-emerald-700">Service saved.</p>
      ) : null}
      {state && !state.success ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );

  if (!itemSummary) {
    return (
      <article className="rounded-lg border bg-background p-4">
        <div className="space-y-3">
          <h3 className="text-base font-medium text-foreground">Add service</h3>
          {content}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-md border bg-background p-4">
      <details>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium text-foreground">
                {itemSummary.item.name}
              </p>
              <ConfidenceBadge confidence={itemSummary.item.confidence} />
              {itemSummary.item.is_active === false ? <ArchivedBadge /> : null}
              {itemSummary.item.is_custom_only ? <CustomOnlyBadge /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatPricingSummary(itemSummary.item)}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">Edit</span>
        </summary>

        <div className="mt-4">{content}</div>
      </details>
    </article>
  );
}

function TextAreaField({
  form,
  id,
  label,
  name,
}: {
  form: ReturnType<typeof useForm<ServiceItemFormValues>>;
  id: string;
  label: string;
  name:
    | 'commonAddons'
    | 'description'
    | 'exclusionNote'
    | 'scopeExcludes'
    | 'scopeIncludes';
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={3}
        {...form.register(name)}
        className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <FieldError message={form.formState.errors[name]?.message as string | undefined} />
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: ServiceCatalogConfidence | string | null;
}) {
  const value = confidence ?? 'unconfirmed';
  const classes =
    value === 'high'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'medium'
        ? 'bg-blue-50 text-blue-700'
        : value === 'low'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-700';

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {formatEnumLabel(value)}
    </span>
  );
}

function ArchivedBadge() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Archived
    </span>
  );
}

function CustomOnlyBadge() {
  return (
    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
      Custom only
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600">{message}</p>;
}

function formatPricingSummary(item: ServiceCatalogItemSummary['item']) {
  const rateSummary = formatRateSummary(item);
  const metric = item.pricing_metric ? formatEnumLabel(item.pricing_metric) : 'No metric';
  const unit = item.unit_label?.trim() || item.unit;

  return [rateSummary, metric, unit].filter(Boolean).join(' · ');
}

function formatRateSummary(item: ServiceCatalogItemSummary['item']) {
  if (item.rate_confirmed !== null) {
    return `Confirmed ${formatMoney(item.rate_confirmed)}`;
  }

  if (item.rate_low !== null || item.rate_high !== null) {
    return `${formatMoney(item.rate_low)} – ${formatMoney(item.rate_high)}`;
  }

  if (item.default_unit_price !== null) {
    return `Default ${formatMoney(item.default_unit_price)}`;
  }

  return 'Custom quote';
}

function formatMoney(value: number | null) {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
