import {
  ErrorCode,
  err,
  ok,
  type ServiceCategoryInput,
  type ServiceItemInput,
  type ListServiceCatalogItemsArgs,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type ServiceCategory =
  Database['public']['Tables']['service_categories']['Row'];
export type ServiceItem = Database['public']['Tables']['service_items']['Row'];
type ServiceCategoryInsert =
  Database['public']['Tables']['service_categories']['Insert'];
type ServiceItemInsert = Database['public']['Tables']['service_items']['Insert'];

export interface ServiceCatalogCategorySummary {
  id: string;
  itemCount: number;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
}

export interface ServiceCatalogItemSummary {
  category: ServiceCatalogCategorySummary | null;
  item: ServiceItem;
}

export interface ServiceCatalogPage {
  categories: ServiceCatalogCategorySummary[];
  items: ServiceCatalogItemSummary[];
  total: number;
}

export interface ServiceCatalogQuoteUsage {
  quoteId: string;
  quoteNumber: string | null;
  status: Database['public']['Enums']['quote_status'];
  title: string | null;
}

export interface ServiceCatalogItemDetail {
  category: ServiceCatalogCategorySummary | null;
  item: ServiceItem;
  quoteUsages: ServiceCatalogQuoteUsage[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function listServiceCategories(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<ServiceCatalogCategorySummary[]>> {
  const { data: categories, error: categoriesError } = await client
    .from('service_categories')
    .select('id, name, parent_id, sort_order')
    .eq('org_id', args.orgId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (categoriesError) {
    return err(ErrorCode.DB_ERROR, categoriesError.message);
  }

  const { data: items, error: itemsError } = await client
    .from('service_items')
    .select('id, category_id')
    .eq('org_id', args.orgId);

  if (itemsError) {
    return err(ErrorCode.DB_ERROR, itemsError.message);
  }

  const countsByCategoryId = new Map<string, number>();

  for (const item of items ?? []) {
    if (!item.category_id) {
      continue;
    }

    countsByCategoryId.set(
      item.category_id,
      (countsByCategoryId.get(item.category_id) ?? 0) + 1
    );
  }

  return ok(
    (categories ?? []).map((category) => ({
      id: category.id,
      itemCount: countsByCategoryId.get(category.id) ?? 0,
      name: category.name,
      parentId: category.parent_id,
      sortOrder: category.sort_order,
    }))
  );
}

export async function listServiceCatalogItems(
  client: DbClient,
  args: ListServiceCatalogItemsArgs
): Promise<Result<ServiceCatalogPage>> {
  const { activity, categoryId, confidence, limit, offset, orgId, search } = args;

  const categoriesResult = await listServiceCategories(client, { orgId });

  if (!categoriesResult.success) {
    return categoriesResult;
  }

  const categoryIdsFromSearch =
    search && search.length > 0
      ? categoriesResult.data
          .filter((category) =>
            category.name.toLowerCase().includes(search.toLowerCase())
          )
          .map((category) => category.id)
      : [];

  let query = client
    .from('service_items')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('category_id', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  if (confidence) {
    query = query.eq('confidence', confidence);
  }

  if (activity === 'active') {
    query = query.eq('is_active', true);
  } else if (activity === 'inactive') {
    query = query.eq('is_active', false);
  }

  if (search) {
    const escaped = escapeLikePattern(search);
    const searchClauses = [
      `name.ilike.%${escaped}%`,
      `description.ilike.%${escaped}%`,
      `scope_includes.ilike.%${escaped}%`,
      `scope_excludes.ilike.%${escaped}%`,
      `common_addons.ilike.%${escaped}%`,
    ];

    if (categoryIdsFromSearch.length > 0) {
      searchClauses.push(`category_id.in.(${categoryIdsFromSearch.join(',')})`);
    }

    query = query.or(searchClauses.join(','));
  }

  const { data: items, error, count } = await query;

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  const categoriesById = new Map(
    categoriesResult.data.map((category) => [category.id, category])
  );

  return ok({
    categories: categoriesResult.data,
    items: (items ?? []).map((item) => ({
      category: item.category_id ? categoriesById.get(item.category_id) ?? null : null,
      item,
    })),
    total: count ?? 0,
  });
}

export async function getServiceCatalogItemById(
  client: DbClient,
  args: { id: string; orgId: string }
): Promise<Result<ServiceCatalogItemDetail>> {
  const { data: item, error: itemError } = await client
    .from('service_items')
    .select('*')
    .eq('id', args.id)
    .eq('org_id', args.orgId)
    .maybeSingle();

  if (itemError) {
    return err(ErrorCode.DB_ERROR, itemError.message);
  }

  if (!item) {
    return err(ErrorCode.NOT_FOUND, `Service item ${args.id} not found`);
  }

  let category: ServiceCatalogCategorySummary | null = null;

  if (item.category_id) {
    const categoriesResult = await listServiceCategories(client, {
      orgId: args.orgId,
    });

    if (!categoriesResult.success) {
      return categoriesResult;
    }

    category =
      categoriesResult.data.find((c) => c.id === item.category_id) ?? null;
  }

  const { data: lineItems, error: lineItemsError } = await client
    .from('quote_line_items')
    .select('quote_id')
    .eq('service_id', args.id);

  if (lineItemsError) {
    return err(ErrorCode.DB_ERROR, lineItemsError.message);
  }

  const quoteIds = Array.from(
    new Set((lineItems ?? []).map((li) => li.quote_id))
  );

  const { data: quotes, error: quotesError } =
    quoteIds.length > 0
      ? await client
          .from('quotes')
          .select('id, quote_number, status, title')
          .eq('org_id', args.orgId)
          .in('id', quoteIds)
      : { data: [], error: null };

  if (quotesError) {
    return err(ErrorCode.DB_ERROR, quotesError.message);
  }

  return ok({
    category,
    item,
    quoteUsages: (quotes ?? []).map((q) => ({
      quoteId: q.id,
      quoteNumber: q.quote_number,
      status: q.status,
      title: q.title,
    })),
  });
}

export async function saveServiceCategory(
  client: DbClient,
  args: { input: ServiceCategoryInput; orgId: string }
): Promise<Result<ServiceCategory>> {
  const payload = {
    name: args.input.name,
    org_id: args.orgId,
    parent_id: args.input.parentId,
    sort_order: args.input.sortOrder,
  } satisfies ServiceCategoryInsert;

  if (args.input.id) {
    const { data, error } = await client
      .from('service_categories')
      .update({
        name: payload.name,
        parent_id: payload.parent_id,
        sort_order: payload.sort_order,
      })
      .eq('id', args.input.id)
      .eq('org_id', args.orgId)
      .select('*')
      .maybeSingle();

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }

    if (!data) {
      return err(
        ErrorCode.NOT_FOUND,
        `Service category ${args.input.id} not found`
      );
    }

    return ok(data);
  }

  const { data, error } = await client
    .from('service_categories')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data);
}

export async function saveServiceItem(
  client: DbClient,
  args: { input: ServiceItemInput; orgId: string }
): Promise<Result<ServiceItem>> {
  const payload = {
    category_id: args.input.categoryId,
    common_addons: args.input.commonAddons,
    confidence: args.input.confidence,
    default_labor_minutes: args.input.defaultLaborMinutes,
    default_markup_pct: args.input.defaultMarkupPct,
    default_unit_price: args.input.defaultUnitPrice,
    description: args.input.description,
    exclusion_note: args.input.exclusionNote,
    is_active: args.input.isActive,
    is_custom_only: args.input.isCustomOnly,
    name: args.input.name,
    org_id: args.orgId,
    pricing_metric: args.input.pricingMetric,
    rate_confirmed: args.input.rateConfirmed,
    rate_high: args.input.rateHigh,
    rate_low: args.input.rateLow,
    scope_excludes: args.input.scopeExcludes,
    scope_includes: args.input.scopeIncludes,
    unit: args.input.unit,
    unit_label: args.input.unitLabel,
  } satisfies ServiceItemInsert;

  if (args.input.id) {
    const { data, error } = await client
      .from('service_items')
      .update({
        category_id: payload.category_id,
        common_addons: payload.common_addons,
        confidence: payload.confidence,
        default_labor_minutes: payload.default_labor_minutes,
        default_markup_pct: payload.default_markup_pct,
        default_unit_price: payload.default_unit_price,
        description: payload.description,
        exclusion_note: payload.exclusion_note,
        is_active: payload.is_active,
        is_custom_only: payload.is_custom_only,
        name: payload.name,
        pricing_metric: payload.pricing_metric,
        rate_confirmed: payload.rate_confirmed,
        rate_high: payload.rate_high,
        rate_low: payload.rate_low,
        scope_excludes: payload.scope_excludes,
        scope_includes: payload.scope_includes,
        unit: payload.unit,
        unit_label: payload.unit_label,
      })
      .eq('id', args.input.id)
      .eq('org_id', args.orgId)
      .select('*')
      .maybeSingle();

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }

    if (!data) {
      return err(ErrorCode.NOT_FOUND, `Service item ${args.input.id} not found`);
    }

    return ok(data);
  }

  const { data, error } = await client
    .from('service_items')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return err(ErrorCode.DB_ERROR, error.message);
  }

  return ok(data);
}

// ---------------------------------------------------------------------------
// Picker projection — lightweight list used by the quote line-item add form.
// Returns only the fields the form needs to pre-fill a new line item.
// ---------------------------------------------------------------------------

export interface CatalogItemForPicker {
  categoryId: string | null;
  categoryName: string | null;
  defaultUnitPrice: number | null;
  id: string;
  name: string;
  rateConfirmed: number | null;
  unit: string;
}

export async function listCatalogItemsForPicker(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<CatalogItemForPicker[]>> {
  const { data: items, error: itemsError } = await client
    .from('service_items')
    .select('id, name, unit, default_unit_price, rate_confirmed, category_id')
    .eq('org_id', args.orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (itemsError) {
    return err(ErrorCode.DB_ERROR, itemsError.message);
  }

  if (!items || items.length === 0) {
    return ok([]);
  }

  const categoryIds = Array.from(
    new Set(
      items
        .map((item) => item.category_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: categories, error: categoriesError } =
    categoryIds.length > 0
      ? await client
          .from('service_categories')
          .select('id, name')
          .eq('org_id', args.orgId)
          .in('id', categoryIds)
      : { data: [] as { id: string; name: string }[], error: null };

  if (categoriesError) {
    return err(ErrorCode.DB_ERROR, categoriesError.message);
  }

  const categoryNamesById = new Map(
    (categories ?? []).map((c) => [c.id, c.name])
  );

  return ok(
    items.map((item) => ({
      categoryId: item.category_id,
      categoryName: item.category_id
        ? (categoryNamesById.get(item.category_id) ?? null)
        : null,
      defaultUnitPrice: item.default_unit_price,
      id: item.id,
      name: item.name,
      rateConfirmed: item.rate_confirmed,
      unit: item.unit,
    }))
  );
}
