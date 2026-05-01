#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const executeMode = process.argv.includes('--execute');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeAddressKey(property) {
  return [
    normalizeKey(property.address_line_1),
    normalizeKey(property.city),
    normalizeKey(property.state),
    normalizeKey(property.zip),
  ].join('|');
}

function createClient(url, serviceRoleKey) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  async function request(endpoint, init = {}) {
    const res = await fetch(`${base}/${endpoint}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      return { data: null, error: { message: data?.message || `${res.status} ${res.statusText}` } };
    }
    return { data, error: null };
  }

  return {
    async select(table, selectClause, filterQuery = '') {
      const query = `select=${encodeURIComponent(selectClause)}${filterQuery ? `&${filterQuery}` : ''}`;
      return request(`${table}?${query}`, { method: 'GET' });
    },
    async remove(table, filterQuery) {
      return request(`${table}?${filterQuery}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
    },
  };
}

async function countReferences(client, propertyId) {
  const filters = `property_id=eq.${propertyId}&select=id`;
  const tables = ['customer_properties', 'jobs', 'geofences', 'vault_items'];
  let total = 0;

  for (const table of tables) {
    const { data, error } = await client.select(table, 'id', filters);
    if (error) {
      return { error: `${table}: ${error.message}`, total };
    }
    total += data?.length || 0;
  }

  return { error: null, total };
}

async function main() {
  loadEnvFile(path.resolve('.env.local'));
  loadEnvFile(path.resolve('.env'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exitCode = 1;
    return;
  }

  const client = createClient(url, serviceRoleKey);
  const { data: properties, error } = await client.select(
    'properties',
    'id,address_line_1,city,state,zip,created_at',
    `org_id=eq.${DEFAULT_ORG_ID}&order=created_at.asc`
  );

  if (error) {
    console.error(`Failed to load properties: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const groups = new Map();
  for (const property of properties || []) {
    const key = normalizeAddressKey(property);
    const group = groups.get(key) ?? [];
    group.push(property);
    groups.set(key, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((group) => group.length > 1);

  console.log(`Found ${duplicateGroups.length} duplicate address group(s).`);
  duplicateGroups.forEach((group) => {
    const [canonical, ...duplicates] = group;
    console.log(`- Keep ${canonical.address_line_1}, ${canonical.city}, ${canonical.state} ${canonical.zip} (${canonical.id}) and remove ${duplicates.length} duplicate(s)`);
  });

  if (!executeMode) {
    console.log('\nPreview only. Re-run with --execute to delete orphaned duplicates.');
    return;
  }

  let deleted = 0;
  let skipped = 0;

  for (const group of duplicateGroups) {
    const [, ...duplicates] = group;
    for (const duplicate of duplicates) {
      const refs = await countReferences(client, duplicate.id);
      if (refs.error) {
        console.warn(`Skipping ${duplicate.id}: ${refs.error}`);
        skipped += 1;
        continue;
      }
      if (refs.total > 0) {
        console.warn(`Skipping ${duplicate.id}: still has ${refs.total} dependent row(s).`);
        skipped += 1;
        continue;
      }

      const { error: deleteError } = await client.remove('properties', `id=eq.${duplicate.id}`);
      if (deleteError) {
        console.warn(`Failed deleting ${duplicate.id}: ${deleteError.message}`);
        skipped += 1;
      } else {
        deleted += 1;
      }
    }
  }

  console.log(`\nDeleted ${deleted} duplicate property row(s). Skipped ${skipped}.`);
}

main().catch((error) => {
  console.error('Fatal dedupe error:', error?.message || error);
  process.exitCode = 1;
});
