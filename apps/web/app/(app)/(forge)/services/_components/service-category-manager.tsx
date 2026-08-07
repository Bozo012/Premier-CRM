'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import type { ServiceCatalogCategorySummary } from '@premier/db';
import { ServiceCategoryInputSchema } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  saveServiceCategoryAction,
  type SaveServiceCategoryActionState,
} from '../actions';

type ServiceCategoryFormValues = z.input<typeof ServiceCategoryInputSchema>;

interface ServiceCategoryManagerProps {
  categories: ServiceCatalogCategorySummary[];
}

function buildCategoryDefaults(
  category?: ServiceCatalogCategorySummary
): ServiceCategoryFormValues {
  return {
    id: category?.id,
    name: category?.name ?? '',
    parentId: category?.parentId ?? '',
    sortOrder: category?.sortOrder ?? '',
  };
}

function appendFormValue(formData: FormData, key: string, value: unknown) {
  if (value === null || value === undefined) {
    formData.append(key, '');
    return;
  }

  formData.append(key, String(value));
}

export function ServiceCategoryManager({
  categories,
}: ServiceCategoryManagerProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Maintain the catalog groups used by service items. Categories do not have an activation flag in the current schema.
        </p>
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <ServiceCategoryEditorCard
            key={category.id}
            category={category}
            categories={categories}
          />
        ))}
        <ServiceCategoryEditorCard categories={categories} />
      </div>
    </section>
  );
}

function ServiceCategoryEditorCard({
  categories,
  category,
}: {
  categories: ServiceCatalogCategorySummary[];
  category?: ServiceCatalogCategorySummary;
}) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    SaveServiceCategoryActionState | null,
    FormData
  >(saveServiceCategoryAction, null);

  const defaultValues = useMemo(
    () => buildCategoryDefaults(category),
    [category]
  );

  const form = useForm<ServiceCategoryFormValues>({
    defaultValues,
    resolver: zodResolver(ServiceCategoryInputSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useEffect(() => {
    if (!state?.success) {
      return;
    }

    if (!category) {
      form.reset(buildCategoryDefaults());
    }

    router.refresh();
  }, [category, form, router, state]);

  const categoryOptions = categories.filter(
    (candidate) => candidate.id !== category?.id
  );

  const isPending = isActionPending || isTransitionPending;

  const onSubmit = form.handleSubmit((values) => {
    const nextFormData = new FormData();
    appendFormValue(nextFormData, 'id', values.id);
    appendFormValue(nextFormData, 'name', values.name);
    appendFormValue(nextFormData, 'parentId', values.parentId);
    appendFormValue(nextFormData, 'sortOrder', values.sortOrder);

    startTransition(() => {
      formAction(nextFormData);
    });
  });

  const content = (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`service-category-name-${category?.id ?? 'new'}`}>
            Category name
          </Label>
          <Input
            id={`service-category-name-${category?.id ?? 'new'}`}
            {...form.register('name')}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`service-category-order-${category?.id ?? 'new'}`}>
            Sort order
          </Label>
          <Input
            id={`service-category-order-${category?.id ?? 'new'}`}
            type="number"
            min="0"
            {...form.register('sortOrder')}
          />
          <FieldError message={form.formState.errors.sortOrder?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`service-category-parent-${category?.id ?? 'new'}`}>
          Parent category
        </Label>
        <select
          id={`service-category-parent-${category?.id ?? 'new'}`}
          {...form.register('parentId')}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">No parent</option>
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <FieldError message={form.formState.errors.parentId?.message} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? 'Saving...'
            : category
              ? 'Save category'
              : 'Create category'}
        </Button>
      </div>

      {state?.success ? (
        <p className="text-sm text-emerald-700">Category saved.</p>
      ) : null}
      {state && !state.success ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );

  if (!category) {
    return (
      <article className="rounded-lg border bg-background p-4">
        <div className="space-y-3">
          <h3 className="text-base font-medium text-foreground">Add category</h3>
          {content}
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-lg border bg-background p-4">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <p className="text-base font-medium text-foreground">{category.name}</p>
            <p className="text-sm text-muted-foreground">
              {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
              {category.parentId ? ' · Nested category' : ''}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">Edit</span>
        </summary>
        <div className="mt-4">{content}</div>
      </details>
    </article>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600">{message}</p>;
}
