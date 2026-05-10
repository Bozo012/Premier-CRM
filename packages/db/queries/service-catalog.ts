import {
  ErrorCode,
  err,
  ok,
  type ListServiceCatalogItemsArgs,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type ServiceCategory =
  Database['public']['Tables']['service_categories']['Row'];
export type ServiceItem = Database['public']['Tables']['service_items']['Row'];

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
