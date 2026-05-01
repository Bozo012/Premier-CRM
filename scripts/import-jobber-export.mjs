#!/usr/bin/env node

/**
 * Jobber CSV import utility (safe by default).
 *
 * Usage:
 *   node scripts/import-jobber-export.mjs --preview
 *   node scripts/import-jobber-export.mjs --execute
 *   node scripts/import-jobber-export.mjs --execute --allow-partial
 *
 * Notes:
 * - Preview is default mode (no writes).
 * - --execute is required to write to Supabase.
 * - Expects Jobber CSV files extracted into ./scripts (ZIPs are detected and reported).
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IMPORT_DIRS = [
  path.resolve('scripts', 'imports', 'jobber'),
  path.resolve('scripts', 'Import', 'jobber'),
  path.resolve('scripts'),
];
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const BATCH_SIZE = 100;

const args = new Set(process.argv.slice(2));
const executeMode = args.has('--execute');
const allowPartialMode = args.has('--allow-partial');
const strictOrgCheck = args.has('--strict-org-check');
const jobsOnlyMode = args.has('--jobs-only');

function getArgValue(name) {
  const full = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (full) return full.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return '';
}

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

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(fullPath));
    else out.push(fullPath);
  }
  return out;
}

function normalizeHeader(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeAddressKey(street1, city, state, zip) {
  return [street1, city, state, zip]
    .map((part) => normalizeKey(part))
    .filter(Boolean)
    .join('|');
}

function compactText(value) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(value);
      const hasContent = row.some((cell) => String(cell || '').trim() !== '');
      if (hasContent) rows.push(row);
      row = [];
      value = '';
    } else {
      value += ch;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    const hasContent = row.some((cell) => String(cell || '').trim() !== '');
    if (hasContent) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = (cells[idx] ?? '').trim();
    });
    return record;
  });
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate);
    const hit = entries.find(([k, v]) => normalizeHeader(k) === wanted && String(v || '').trim() !== '');
    if (hit) return String(hit[1]).trim();
  }
  for (const [key, val] of entries) {
    const k = normalizeHeader(key);
    if (!String(val || '').trim()) continue;
    for (const candidate of candidates) {
      if (k.includes(normalizeHeader(candidate))) return String(val).trim();
    }
  }
  return '';
}

function pickLinkField(row, candidates, excludedTokens = []) {
  const entries = Object.entries(row);
  const normalizedExclusions = excludedTokens.map((t) => normalizeHeader(t));

  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate);
    const exact = entries.find(([k, v]) => {
      const nk = normalizeHeader(k);
      return nk === wanted && String(v || '').trim() !== '';
    });
    if (exact) return String(exact[1]).trim();
  }

  for (const [key, val] of entries) {
    const nk = normalizeHeader(key);
    if (!String(val || '').trim()) continue;
    if (normalizedExclusions.some((token) => nk.includes(token))) continue;
    for (const candidate of candidates) {
      if (nk.includes(normalizeHeader(candidate))) return String(val).trim();
    }
  }
  return '';
}

function detectEntityType(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const normalized = name.replace(/[^a-z0-9]+/g, ' ').trim();

  // Prioritize property-related exports (e.g. "Client Properties.csv")
  if (/\bpropert(?:y|ies)?\b/.test(normalized)) return 'properties';
  if (/\b(client|clients|customer|customers)\b/.test(normalized)) return 'customers';
  if (/\b(job|jobs)\b/.test(normalized)) return 'jobs';
  return 'unknown';
}

function normalizeCustomer(row, rowNumber) {
  const firstName = pickField(row, ['first name']);
  const lastName = pickField(row, ['last name']);
  const name = pickField(row, ['name', 'client name']);
  const company = pickField(row, ['company', 'company name']);
  const email = normalizeEmail(pickField(row, ['email', 'email address']));
  const phone = normalizePhone(pickField(row, ['phone', 'mobile', 'phone number']));
  const jobberId = pickField(row, ['jobber id', 'client id', 'customer id', 'id']) || null;

  const inferredFirst = !firstName && name ? name.split(' ')[0] : firstName;
  const inferredLast = !lastName && name && name.split(' ').length > 1 ? name.split(' ').slice(1).join(' ') : lastName;

  return {
    sourceRowNumber: rowNumber,
    raw: row,
    jobber_id: jobberId,
    first_name: inferredFirst || null,
    last_name: inferredLast || null,
    company_name: company || null,
    email,
    phone_primary: phone,
    notes: pickField(row, ['notes']) || null,
    source_client_id: jobberId,
  };
}

function normalizeProperty(row, rowNumber) {
  const fullAddress = pickField(row, ['address', 'property address']);
  let street1 = pickField(row, ['street 1', 'address line 1', 'street']);
  const street2 = pickField(row, ['street 2', 'address line 2']) || null;
  const city = pickField(row, ['city']);
  const state = pickField(row, ['state', 'province']);
  const zip = pickField(row, ['zip', 'zip code', 'postal code']);
  const sourceClientId = pickField(row, ['client id', 'customer id']) || null;
  const sourceClientRef =
    sourceClientId ||
    pickLinkField(
      row,
      ['client name', 'customer name', 'customer/client', 'client', 'customer', 'email', 'phone'],
      ['id', 'note', 'address'],
    ) ||
    null;
  if (!street1 && fullAddress) street1 = fullAddress.split(',')[0]?.trim();

  return {
    sourceRowNumber: rowNumber,
    raw: row,
    jobber_id: pickField(row, ['jobber id', 'property id', 'id']) || null,
    source_client_id: sourceClientId,
    source_client_ref: sourceClientRef,
    address_line_1: street1 || '',
    address_line_2: street2,
    city: city || '',
    state: state || '',
    zip: zip || '',
    notes: pickField(row, ['notes']) || null,
  };
}

function mapJobStatus(statusRaw) {
  const s = normalizeHeader(statusRaw);
  if (s.includes('complete')) return 'completed';
  if (s.includes('progress')) return 'in_progress';
  if (s.includes('schedule')) return 'scheduled';
  if (s.includes('approve')) return 'approved';
  if (s.includes('quote')) return 'quoted';
  if (s.includes('invoice')) return 'invoiced';
  if (s.includes('paid')) return 'paid';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('hold')) return 'on_hold';
  return 'lead';
}

function normalizeJob(row, rowNumber) {
  const sourceClientId = pickLinkField(row, ['client id', 'customer id']) || null;
  const sourcePropertyId = pickField(row, ['property id']) || null;
  const sourceClientRef =
    sourceClientId ||
    pickLinkField(
      row,
      ['client name', 'customer name', 'customer/client', 'client', 'customer'],
      ['id', 'note', 'email', 'phone', 'address'],
    ) ||
    null;
  const sourcePropertyRef =
    sourcePropertyId ||
    pickLinkField(
      row,
      ['property name', 'property address', 'service address', 'property', 'address'],
      ['id', 'note', 'email', 'phone'],
    ) ||
    null;

  return {
    sourceRowNumber: rowNumber,
    raw: row,
    jobber_id: pickField(row, ['jobber id', 'job id', 'id']) || null,
    source_client_id: sourceClientId,
    source_property_id: sourcePropertyId,
    source_client_ref: sourceClientRef,
    source_property_ref: sourcePropertyRef,
    title: pickField(row, ['title', 'job title']) || 'Imported Job',
    description: pickField(row, ['description']) || null,
    status: mapJobStatus(pickField(row, ['status'])),
    scheduled_start: pickField(row, ['start date', 'scheduled start']) || null,
    scheduled_end: pickField(row, ['end date', 'scheduled end']) || null,
  };
}

function inferReferenceShape(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return 'empty';
  if (/^\d+$/.test(normalized)) return 'numeric_id';
  if (/^[a-f0-9-]{8,}$/i.test(normalized)) return 'uuidish_or_hex_id';
  if (normalized.includes('@')) return 'email_like';
  if (/^\+?[\d()\-\s.]+$/.test(normalized)) return 'phone_like';
  if (/\d+\s+\w+/.test(normalized) || /,\s*[a-z]{2}\b/.test(normalized)) return 'address_like';
  if (/[a-z]/.test(normalized) && /\s/.test(normalized)) return 'name_like';
  return 'text';
}

function printJobLinkDiagnostics(entityRows, customerIdByJobber, propertyIdByJobber) {
  const jobs = entityRows.jobs || [];
  const customers = entityRows.customers || [];
  const properties = entityRows.properties || [];

  console.log('\nJob-link diagnostics:');
  console.log('- Normalized job rows (first 20, linking fields + raw values):');
  jobs.slice(0, 20).forEach((job) => {
    const rawClient = pickField(job.raw, ['client id', 'customer id', 'client', 'customer']);
    const rawProperty = pickField(job.raw, ['property id', 'property', 'address', 'property address']);
    const rawJobberId = pickField(job.raw, ['jobber id', 'job id', 'id']);
    const rawTitle = pickField(job.raw, ['title', 'job title']);
    console.log(
      `  - row ${job.sourceRowNumber}: source_client_id="${job.source_client_id || ''}" source_client_ref="${job.source_client_ref || ''}" (raw="${rawClient || ''}"), source_property_id="${job.source_property_id || ''}" source_property_ref="${job.source_property_ref || ''}" (raw="${rawProperty || ''}"), jobber_id="${job.jobber_id || ''}" (raw="${rawJobberId || ''}"), title="${job.title || ''}" (raw="${rawTitle || ''}")`,
    );
  });

  console.log('- Available imported customer map keys (first 20 customers.jobber_id):');
  Array.from(customerIdByJobber.keys())
    .slice(0, 20)
    .forEach((key) => console.log(`  - ${key}`));
  if (!customerIdByJobber.size) console.log('  - <none>');

  console.log('- Available imported property map keys (first 20 properties.jobber_id):');
  Array.from(propertyIdByJobber.keys())
    .slice(0, 20)
    .forEach((key) => console.log(`  - ${key}`));
  if (!propertyIdByJobber.size) console.log('  - <none>');

  const missingCustomer = [];
  const missingProperty = [];

  for (const job of jobs) {
    if (!job.source_client_id || !customerIdByJobber.has(job.source_client_id)) {
      missingCustomer.push(`${job.jobber_id || `row-${job.sourceRowNumber}`} (source_client_id="${job.source_client_id || ''}", source_client_ref="${job.source_client_ref || ''}")`);
    }
    if (!job.source_property_id || !propertyIdByJobber.has(job.source_property_id)) {
      missingProperty.push(`${job.jobber_id || `row-${job.sourceRowNumber}`} (source_property_id="${job.source_property_id || ''}", source_property_ref="${job.source_property_ref || ''}")`);
    }
  }

  console.log('- Jobs with no matching customer (first 50):');
  if (!missingCustomer.length) console.log('  - <none>');
  missingCustomer.slice(0, 50).forEach((line) => console.log(`  - ${line}`));

  console.log('- Jobs with no matching property (first 50):');
  if (!missingProperty.length) console.log('  - <none>');
  missingProperty.slice(0, 50).forEach((line) => console.log(`  - ${line}`));

  const customerShapes = new Set(jobs.map((j) => inferReferenceShape(j.source_client_id || j.source_client_ref)));
  const propertyShapes = new Set(jobs.map((j) => inferReferenceShape(j.source_property_id || j.source_property_ref)));
  const usesNamesForCustomer = customerShapes.has('name_like') || customerShapes.has('email_like') || customerShapes.has('phone_like');
  const usesAddressForProperty = propertyShapes.has('address_like') || propertyShapes.has('name_like');

  console.log('- Link-field shape analysis:');
  console.log(`  - customer source values look like: ${Array.from(customerShapes).join(', ') || 'none'}`);
  console.log(`  - property source values look like: ${Array.from(propertyShapes).join(', ') || 'none'}`);
  console.log(`  - jobs CSV appears to use customer names/emails/phones instead of IDs: ${usesNamesForCustomer ? 'yes' : 'no'}`);
  console.log(`  - jobs CSV appears to use property names/addresses instead of IDs: ${usesAddressForProperty ? 'yes' : 'no'}`);

  const customerNameKeys = new Set();
  const customerEmailKeys = new Set();
  const customerPhoneKeys = new Set();
  customers.forEach((c) => {
    const fullName = normalizeKey(`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name);
    if (fullName) customerNameKeys.add(fullName);
    if (c.email) customerEmailKeys.add(normalizeEmail(c.email));
    if (c.phone_primary) customerPhoneKeys.add(normalizePhone(c.phone_primary));
  });

  const propertyAddressKeys = new Set();
  properties.forEach((p) => {
    const key = normalizeAddressKey(p.address_line_1, p.city, p.state, p.zip);
    if (key) propertyAddressKeys.add(key);
  });

  const likelyCustomerFallbackMatches = jobs.filter((j) => {
    const rawClient = j.source_client_ref || pickField(j.raw, ['client', 'customer', 'client name', 'customer name', 'email', 'phone']);
    const normalized = normalizeKey(rawClient);
    if (!normalized) return false;
    return customerNameKeys.has(normalized) || customerEmailKeys.has(normalized) || customerPhoneKeys.has(normalizePhone(normalized));
  }).length;
  const likelyPropertyFallbackMatches = jobs.filter((j) => {
    const rawAddress = j.source_property_ref || pickField(j.raw, ['property', 'address', 'property address']);
    const key = normalizeKey(rawAddress);
    if (!key) return false;
    return Array.from(propertyAddressKeys).some((addressKey) => addressKey.includes(key) || key.includes(addressKey));
  }).length;

  console.log(`- Potential fallback matches by customer name/email/phone: ${likelyCustomerFallbackMatches}/${jobs.length}`);
  console.log(`- Potential fallback matches by property address: ${likelyPropertyFallbackMatches}/${jobs.length}`);
}

function validateCustomers(records) {
  const errors = [];
  const warnings = [];
  let valid = 0;
  const duplicateCheck = new Set();

  for (const rec of records) {
    const hasName = Boolean(rec.company_name || rec.first_name || rec.last_name);
    if (!hasName) {
      errors.push(`row ${rec.sourceRowNumber}: missing name/company`);
      continue;
    }

    const dedupeKey = rec.jobber_id || `${rec.email || ''}|${rec.phone_primary || ''}|${(rec.first_name || '') + (rec.last_name || '')}`;
    if (duplicateCheck.has(dedupeKey)) warnings.push(`row ${rec.sourceRowNumber}: likely duplicate customer (${dedupeKey})`);
    duplicateCheck.add(dedupeKey);

    if (!rec.email && rec.phone_primary) warnings.push(`row ${rec.sourceRowNumber}: missing email but has phone`);
    valid += 1;
  }

  return { valid, errors, warnings };
}

function validateProperties(records) {
  const errors = [];
  const warnings = [];
  let valid = 0;
  const dupes = new Set();
  for (const rec of records) {
    if (!rec.address_line_1 || !rec.city || !rec.state || !rec.zip) {
      errors.push(`row ${rec.sourceRowNumber}: missing required address field(s)`);
      continue;
    }
    const key = rec.jobber_id || `${rec.address_line_1}|${rec.city}|${rec.state}|${rec.zip}`;
    if (dupes.has(key)) warnings.push(`row ${rec.sourceRowNumber}: likely duplicate property (${key})`);
    dupes.add(key);
    valid += 1;
  }
  return { valid, errors, warnings };
}

function validateJobs(records) {
  const errors = [];
  let valid = 0;
  const warnings = [];
  const dupes = new Set();
  for (const rec of records) {
    if (!rec.title) {
      errors.push(`row ${rec.sourceRowNumber}: missing title`);
      continue;
    }
    const key = rec.jobber_id || `${rec.title}|${rec.source_client_id || ''}|${rec.source_property_id || ''}`;
    if (dupes.has(key)) warnings.push(`row ${rec.sourceRowNumber}: likely duplicate job (${key})`);
    dupes.add(key);
    valid += 1;
  }
  return { valid, errors, warnings };
}

function customerNaturalKey(record) {
  if (record.jobber_id) return `jobber:${record.jobber_id}`;
  const email = normalizeEmail(record.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(record.phone_primary);
  if (phone) return `phone:${phone}`;
  const fullName = normalizeKey(
    `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.company_name,
  );
  if (fullName) return `name:${fullName}`;
  return `row:${record.sourceRowNumber ?? crypto.randomUUID?.() ?? Math.random()}`;
}

function propertyNaturalKey(record) {
  if (record.jobber_id) return `jobber:${record.jobber_id}`;
  const addressKey = normalizeAddressKey(
    record.address_line_1,
    record.city,
    record.state,
    record.zip,
  );
  if (addressKey) return `address:${addressKey}`;
  return `row:${record.sourceRowNumber ?? crypto.randomUUID?.() ?? Math.random()}`;
}

function dedupeRecords(records, getKey) {
  const seen = new Map();
  for (const record of records) {
    const key = getKey(record);
    if (!seen.has(key)) seen.set(key, record);
  }
  return Array.from(seen.values());
}

function removeNullishValues(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function createClient(url, serviceRoleKey, _options = {}) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  async function request(endpoint, init = {}) {
    const res = await fetch(`${base}/${endpoint}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
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
    async insert(table, rows, returning = 'id') {
      return request(table, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(rows),
      }).then((res) => {
        if (res.error) return res;
        if (!returning) return res;
        return { data: (res.data || []).map((row) => ({ [returning]: row[returning] })), error: null };
      });
    },
    async upsert(table, rows, onConflict, returning = 'id') {
      const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      return request(`${table}${query}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(rows),
      }).then((res) => {
        if (res.error) return res;
        if (!returning) return res;
        return { data: (res.data || []).map((row) => ({ [returning]: row[returning] })), error: null };
      });
    },
    async update(table, filters, row, returning = 'id') {
      const query = filters ? `?${filters}` : '';
      return request(`${table}${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      }).then((res) => {
        if (res.error) return res;
        if (!returning) return res;
        return { data: (res.data || []).map((updated) => ({ [returning]: updated[returning] })), error: null };
      });
    },
  };
}

async function upsertBatches(supabase, table, rows, onConflict) {
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.upsert(table, batch, onConflict, 'id');
    if (error) {
      failed += batch.length;
      console.error(`[${table}] batch failed (${i}-${i + batch.length - 1}): ${error.message}`);
    } else {
      imported += data?.length || batch.length;
    }
  }
  return { imported, failed };
}

async function insertBatches(supabase, table, rows) {
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.insert(table, batch, 'id');
    if (error) {
      failed += batch.length;
      console.error(`[${table}] insert batch failed (${i}-${i + batch.length - 1}): ${error.message}`);
    } else {
      imported += data?.length || batch.length;
    }
  }
  return { imported, failed };
}

async function updateBatchesById(supabase, table, rows) {
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const { id, ...rest } = row;
    const payload = removeNullishValues(rest);
    const { data, error } = await supabase.update(table, `id=eq.${id}`, payload, 'id');
    if (error) {
      failed += 1;
      console.error(`[${table}] update failed for ${id}: ${error.message}`);
    } else {
      updated += data?.length || 1;
    }
  }
  return { imported: updated, failed };
}

async function main() {
  loadEnvFile(path.resolve('.env.local'));
  loadEnvFile(path.resolve('.env'));

  const requestedDir = getArgValue('--dir');
  const importDirs = requestedDir ? [path.resolve(requestedDir)] : DEFAULT_IMPORT_DIRS;
  const existingImportDirs = importDirs.filter((dir) => fs.existsSync(dir));
  const allFiles = existingImportDirs.flatMap((dir) => walkFiles(dir));
  const csvFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.csv'));
  const zipFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.zip'));

  console.log(`Mode: ${executeMode ? 'EXECUTE' : 'PREVIEW (default)'}\n`);
  if (jobsOnlyMode) {
    console.log('Flag enabled: --jobs-only (customers/properties upsert skipped; jobs rely on existing imported maps).');
  }
  console.log('Scanned directories:');
  importDirs.forEach((dir) => {
    const status = fs.existsSync(dir) ? 'found' : 'missing';
    console.log(`- ${path.relative(process.cwd(), dir) || '.'} (${status})`);
  });
  console.log('');

  if (zipFiles.length) {
    console.log('Detected ZIP files (extract before import):');
    zipFiles.forEach((f) => console.log(`- ${path.relative(process.cwd(), f)}`));
    console.log('');
  }

  if (!csvFiles.length) {
    const targetLabel = requestedDir ? requestedDir : 'scripts/imports/jobber (and fallback script directories)';
    console.log(`No CSV files found under ${targetLabel}.`);
    console.log('No data written. Re-run with extracted Jobber CSV files.');
    return;
  }

  const entityRows = {
    customers: [],
    properties: [],
    jobs: [],
  };

  console.log('Detected CSV files:');
  for (const file of csvFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rows = parseCsv(content);
    const entity = detectEntityType(file);
    console.log(`- ${path.relative(process.cwd(), file)} (${rows.length} rows, detected: ${entity})`);

    if (entity === 'customers') {
      rows.forEach((row, idx) => entityRows.customers.push(normalizeCustomer(row, idx + 2)));
    } else if (entity === 'properties') {
      rows.forEach((row, idx) => entityRows.properties.push(normalizeProperty(row, idx + 2)));
    } else if (entity === 'jobs') {
      rows.forEach((row, idx) => entityRows.jobs.push(normalizeJob(row, idx + 2)));
    }
  }

  const customerValidation = validateCustomers(entityRows.customers);
  const propertyValidation = validateProperties(entityRows.properties);
  const jobValidation = validateJobs(entityRows.jobs);

  console.log('\nEntity counts:');
  console.log(`- Customers parsed: ${entityRows.customers.length}`);
  console.log(`- Properties parsed: ${entityRows.properties.length}`);
  console.log(`- Jobs parsed: ${entityRows.jobs.length}`);

  console.log('\nNormalized preview (first 3 each):');
  console.log('Customers:', entityRows.customers.slice(0, 3).map((c) => ({ jobber_id: c.jobber_id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name, email: c.email, phone_primary: c.phone_primary })));
  console.log('Properties:', entityRows.properties.slice(0, 3).map((p) => ({ jobber_id: p.jobber_id, address_line_1: p.address_line_1, city: p.city, state: p.state, zip: p.zip, source_client_id: p.source_client_id })));
  console.log('Jobs:', entityRows.jobs.slice(0, 3).map((j) => ({ jobber_id: j.jobber_id, title: j.title, status: j.status, source_client_id: j.source_client_id, source_property_id: j.source_property_id })));

  console.log('\nValidation summary:');
  for (const [label, v] of [
    ['Customers', customerValidation],
    ['Properties', propertyValidation],
    ['Jobs', jobValidation],
  ]) {
    console.log(`- ${label}: ${v.valid} valid, ${v.errors.length} fatal errors, ${v.warnings.length} warnings`);
  }

  const allErrors = [...customerValidation.errors, ...propertyValidation.errors, ...jobValidation.errors];
  if (allErrors.length) {
    console.log('\nFatal validation errors (first 20):');
    allErrors.slice(0, 20).forEach((e) => console.log(`  - ${e}`));
  }

  const allWarnings = [...customerValidation.warnings, ...propertyValidation.warnings, ...jobValidation.warnings];
  if (allWarnings.length) {
    console.log('\nWarnings (first 20):');
    allWarnings.slice(0, 20).forEach((w) => console.log(`  - ${w}`));
  }

  if (!executeMode) {
    const customerIdByJobber = new Map(
      entityRows.customers
        .filter((c) => c.jobber_id)
        .map((c) => [c.jobber_id, `preview-customer-${c.sourceRowNumber}`]),
    );
    const propertyIdByJobber = new Map(
      entityRows.properties
        .filter((p) => p.jobber_id)
        .map((p) => [p.jobber_id, `preview-property-${p.sourceRowNumber}`]),
    );
    printJobLinkDiagnostics(entityRows, customerIdByJobber, propertyIdByJobber);
    console.log('\nNo data written. Re-run with --execute to import.');
    return;
  }

  if (allErrors.length && !allowPartialMode) {
    console.error('\nImport blocked: fix fatal validation errors before running --execute (or pass --allow-partial to skip invalid rows).');
    process.exitCode = 1;
    return;
  }

  if (allErrors.length && allowPartialMode) {
    console.warn(`\nContinuing with --allow-partial. Skipping ${allErrors.length} invalid row(s).`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env(.local).');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: orgRows, error: orgError } = await supabase.select('organizations', 'id,name', `id=eq.${DEFAULT_ORG_ID}&limit=1`);
  if (orgError) {
    if (strictOrgCheck) {
      console.error(`Failed org lookup: ${orgError.message}`);
      process.exitCode = 1;
      return;
    }
    console.warn(`Org lookup warning (continuing): ${orgError.message}`);
  }
  if (!orgError && !orgRows?.length) {
    if (strictOrgCheck) {
      console.error(`Organization not found: ${DEFAULT_ORG_ID}`);
      process.exitCode = 1;
      return;
    }
    console.warn(`Org lookup warning (continuing): organization not found: ${DEFAULT_ORG_ID}`);
  }
  if (orgRows?.length) {
    console.log(`\nTarget organization: ${orgRows[0].name} (${orgRows[0].id})`);
  } else {
    console.log(`\nTarget organization id (unverified): ${DEFAULT_ORG_ID}`);
  }

  const { data: customersForFallback, error: customerFallbackError } = await supabase.select(
    'customers',
    'id,jobber_id,first_name,last_name,company_name,email,phone_primary',
    `org_id=eq.${DEFAULT_ORG_ID}`,
  );
  if (customerFallbackError) {
    console.error(`Failed to read customers for fallback matching: ${customerFallbackError.message}`);
    process.exitCode = 1;
    return;
  }
  const { data: propertiesForFallback, error: propertyFallbackError } = await supabase.select(
    'properties',
    'id,jobber_id,address_line_1,city,state,zip',
    `org_id=eq.${DEFAULT_ORG_ID}`,
  );
  if (propertyFallbackError) {
    console.error(`Failed to read properties for fallback matching: ${propertyFallbackError.message}`);
    process.exitCode = 1;
    return;
  }

  const customerRows = dedupeRecords(
    entityRows.customers
      .filter((r) => !customerValidation.errors.some((e) => e.includes(`row ${r.sourceRowNumber}:`)))
      .map((r) => ({
        ...r,
        org_id: DEFAULT_ORG_ID,
        source: 'jobber_import',
        type: 'residential',
      })),
    customerNaturalKey,
  );

  const propertyRows = dedupeRecords(
    entityRows.properties
      .filter((r) => !propertyValidation.errors.some((e) => e.includes(`row ${r.sourceRowNumber}:`)))
      .map((r) => ({
        ...r,
        org_id: DEFAULT_ORG_ID,
        country: 'US',
      })),
    propertyNaturalKey,
  );

  const existingCustomerIdByNaturalKey = new Map(
    customersForFallback.map((customer) => [customerNaturalKey(customer), customer.id]),
  );
  const existingPropertyIdByNaturalKey = new Map(
    propertiesForFallback.map((property) => [propertyNaturalKey(property), property.id]),
  );

  const customerRowsWithJobber = customerRows.filter((row) => row.jobber_id).map((row) => ({
    org_id: row.org_id,
    jobber_id: row.jobber_id,
    first_name: row.first_name,
    last_name: row.last_name,
    company_name: row.company_name,
    email: row.email,
    phone_primary: row.phone_primary,
    notes: row.notes,
    source: row.source,
    type: row.type,
  }));
  const customerUpdatesByNaturalKey = customerRows
    .filter((row) => !row.jobber_id && existingCustomerIdByNaturalKey.has(customerNaturalKey(row)))
    .map((row) => ({
      id: existingCustomerIdByNaturalKey.get(customerNaturalKey(row)),
      first_name: row.first_name,
      last_name: row.last_name,
      company_name: row.company_name,
      email: row.email,
      phone_primary: row.phone_primary,
      notes: row.notes,
      source: row.source,
      type: row.type,
    }));
  const customerInsertsByNaturalKey = customerRows
    .filter((row) => !row.jobber_id && !existingCustomerIdByNaturalKey.has(customerNaturalKey(row)))
    .map((row) => ({
      org_id: row.org_id,
      first_name: row.first_name,
      last_name: row.last_name,
      company_name: row.company_name,
      email: row.email,
      phone_primary: row.phone_primary,
      notes: row.notes,
      source: row.source,
      type: row.type,
    }));

  const propertyRowsWithJobber = propertyRows.filter((row) => row.jobber_id).map((row) => ({
    org_id: row.org_id,
    jobber_id: row.jobber_id,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    notes: row.notes,
    country: row.country,
  }));
  const propertyUpdatesByNaturalKey = propertyRows
    .filter((row) => !row.jobber_id && existingPropertyIdByNaturalKey.has(propertyNaturalKey(row)))
    .map((row) => ({
      id: existingPropertyIdByNaturalKey.get(propertyNaturalKey(row)),
      address_line_1: row.address_line_1,
      address_line_2: row.address_line_2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      notes: row.notes,
      country: row.country,
    }));
  const propertyInsertsByNaturalKey = propertyRows
    .filter((row) => !row.jobber_id && !existingPropertyIdByNaturalKey.has(propertyNaturalKey(row)))
    .map((row) => ({
      org_id: row.org_id,
      address_line_1: row.address_line_1,
      address_line_2: row.address_line_2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      notes: row.notes,
      country: row.country,
    }));

  const customerUpsertResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await upsertBatches(supabase, 'customers', customerRowsWithJobber, 'jobber_id');
  const customerUpdateResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await updateBatchesById(supabase, 'customers', customerUpdatesByNaturalKey);
  const customerInsertResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await insertBatches(supabase, 'customers', customerInsertsByNaturalKey);

  const propertyUpsertResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await upsertBatches(supabase, 'properties', propertyRowsWithJobber, 'jobber_id');
  const propertyUpdateResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await updateBatchesById(supabase, 'properties', propertyUpdatesByNaturalKey);
  const propertyInsertResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await insertBatches(supabase, 'properties', propertyInsertsByNaturalKey);

  const customerResult = {
    imported:
      customerUpsertResult.imported +
      customerUpdateResult.imported +
      customerInsertResult.imported,
    failed:
      customerUpsertResult.failed +
      customerUpdateResult.failed +
      customerInsertResult.failed,
  };

  const propertyResult = {
    imported:
      propertyUpsertResult.imported +
      propertyUpdateResult.imported +
      propertyInsertResult.imported,
    failed:
      propertyUpsertResult.failed +
      propertyUpdateResult.failed +
      propertyInsertResult.failed,
  };

  const { data: customersDb, error: customerMapError } = await supabase.select(
    'customers',
    'id,jobber_id,first_name,last_name,company_name,email,phone_primary',
    `org_id=eq.${DEFAULT_ORG_ID}`,
  );
  if (customerMapError) {
    console.error(`Failed to read customer map: ${customerMapError.message}`);
    process.exitCode = 1;
    return;
  }

  const { data: propertiesDb, error: propertyMapError } = await supabase.select(
    'properties',
    'id,jobber_id,address_line_1,city,state,zip',
    `org_id=eq.${DEFAULT_ORG_ID}`,
  );
  if (propertyMapError) {
    console.error(`Failed to read property map: ${propertyMapError.message}`);
    process.exitCode = 1;
    return;
  }

  const customerIdByJobber = new Map(
    customersDb.filter((x) => x.jobber_id).map((x) => [x.jobber_id, x.id])
  );
  const propertyIdByJobber = new Map(
    propertiesDb.filter((x) => x.jobber_id).map((x) => [x.jobber_id, x.id])
  );
  printJobLinkDiagnostics(entityRows, customerIdByJobber, propertyIdByJobber);

  const customerIdByName = new Map();
  const customerIdByEmail = new Map();
  const customerIdByPhone = new Map();
  for (const c of customersDb) {
    const fullName = normalizeKey(`${c.first_name || ''} ${c.last_name || ''}`.trim());
    const companyName = normalizeKey(c.company_name);
    if (fullName && !customerIdByName.has(fullName)) customerIdByName.set(fullName, c.id);
    if (companyName && !customerIdByName.has(companyName)) customerIdByName.set(companyName, c.id);
    const emailKey = normalizeEmail(c.email);
    if (emailKey && !customerIdByEmail.has(emailKey)) customerIdByEmail.set(emailKey, c.id);
    const phoneKey = normalizePhone(c.phone_primary);
    if (phoneKey && !customerIdByPhone.has(phoneKey)) customerIdByPhone.set(phoneKey, c.id);
    if (c.jobber_id && !customerIdByJobber.has(c.jobber_id)) customerIdByJobber.set(c.jobber_id, c.id);
  }

  const propertyIdByAddress = new Map();
  const propertyIdByStreet = new Map();
  const propertyIdByCompactAddress = new Map();
  for (const p of propertiesDb) {
    const key = normalizeAddressKey(p.address_line_1, p.city, p.state, p.zip);
    if (key && !propertyIdByAddress.has(key)) propertyIdByAddress.set(key, p.id);
    const streetKey = normalizeKey(p.address_line_1);
    if (streetKey && !propertyIdByStreet.has(streetKey)) propertyIdByStreet.set(streetKey, p.id);
    const compactAddress = compactText(`${p.address_line_1 || ''} ${p.city || ''} ${p.state || ''} ${p.zip || ''}`);
    if (compactAddress && !propertyIdByCompactAddress.has(compactAddress)) propertyIdByCompactAddress.set(compactAddress, p.id);
    if (p.jobber_id && !propertyIdByJobber.has(p.jobber_id)) propertyIdByJobber.set(p.jobber_id, p.id);
  }

  const customerPropertyRows = [];
  const customerPropertyFailures = [];

  if (!jobsOnlyMode) {
    for (const p of entityRows.properties) {
      let customerId = p.source_client_id ? customerIdByJobber.get(p.source_client_id) : null;
      let propertyId = p.jobber_id ? propertyIdByJobber.get(p.jobber_id) : null;

      if (!customerId && p.source_client_ref) {
        const byName = customerIdByName.get(normalizeKey(p.source_client_ref));
        const byEmail = customerIdByEmail.get(normalizeEmail(p.source_client_ref));
        const byPhone = customerIdByPhone.get(normalizePhone(p.source_client_ref));
        customerId = byName || byEmail || byPhone || null;
      }

      if (!propertyId) {
        const fullAddressKey = normalizeAddressKey(
          p.address_line_1,
          p.city,
          p.state,
          p.zip,
        );
        propertyId =
          propertyIdByAddress.get(fullAddressKey) ||
          propertyIdByStreet.get(normalizeKey(p.address_line_1)) ||
          propertyIdByCompactAddress.get(
            compactText(`${p.address_line_1 || ''} ${p.city || ''} ${p.state || ''} ${p.zip || ''}`)
          ) ||
          null;
      }

      if (!customerId || !propertyId) {
        customerPropertyFailures.push(
          `property row ${p.sourceRowNumber}: missing link customer_id(${p.source_client_id || p.source_client_ref || ''}) or property_id(${p.jobber_id || p.address_line_1 || ''})`
        );
        continue;
      }
      customerPropertyRows.push({
        customer_id: customerId,
        property_id: propertyId,
        relationship: 'owner',
        is_primary: false,
      });
    }
  }

  const cpResult = jobsOnlyMode
    ? { imported: 0, failed: 0 }
    : await upsertBatches(supabase, 'customer_properties', customerPropertyRows, 'customer_id,property_id');

  const jobRows = [];
  const jobFailures = [];

  for (const j of entityRows.jobs) {
    let customerId = j.source_client_id ? customerIdByJobber.get(j.source_client_id) : null;
    let propertyId = j.source_property_id ? propertyIdByJobber.get(j.source_property_id) : null;

    if (!customerId) {
      const rawClient = pickField(j.raw, ['client', 'customer', 'client name', 'customer name', 'email', 'phone']);
      const byName = customerIdByName.get(normalizeKey(rawClient));
      const byEmail = customerIdByEmail.get(normalizeEmail(rawClient));
      const byPhone = customerIdByPhone.get(normalizePhone(rawClient));
      customerId = byName || byEmail || byPhone || null;
    }

    if (!propertyId) {
      const rawAddress = pickField(j.raw, ['property address', 'address', 'property']);
      const normalizedAddress = normalizeKey(rawAddress);
      if (normalizedAddress) {
        propertyId =
          Array.from(propertyIdByAddress.entries()).find(
            ([addressKey]) => addressKey.includes(normalizedAddress) || normalizedAddress.includes(addressKey),
          )?.[1] || null;
      }
    }

    if (!customerId || !propertyId) {
      jobFailures.push(
        `job row ${j.sourceRowNumber}: unresolved customer/property reference (customer_source_id="${j.source_client_id || ''}", customer_source_ref="${j.source_client_ref || ''}", property_source_id="${j.source_property_id || ''}", property_source_ref="${j.source_property_ref || ''}", title="${j.title}")`,
      );
      continue;
    }

    jobRows.push({
      org_id: DEFAULT_ORG_ID,
      jobber_id: j.jobber_id,
      customer_id: customerId,
      property_id: propertyId,
      title: j.title,
      description: j.description,
      status: j.status,
      scheduled_start: j.scheduled_start || null,
      scheduled_end: j.scheduled_end || null,
      priority: 'normal',
    });
  }

  const jobResult = await upsertBatches(supabase, 'jobs', jobRows, 'jobber_id');

  console.log('\nImport complete:');
  console.log(`- Customers imported/updated: ${customerResult.imported}`);
  console.log(`- Customers failed: ${customerResult.failed}`);
  console.log(`- Properties imported/updated: ${propertyResult.imported}`);
  console.log(`- Properties failed: ${propertyResult.failed}`);
  console.log(`- Customer-property links imported/updated: ${cpResult.imported}`);
  console.log(`- Customer-property links failed: ${cpResult.failed + customerPropertyFailures.length}`);
  console.log(`- Jobs imported/updated: ${jobResult.imported}`);
  console.log(`- Jobs failed: ${jobResult.failed + jobFailures.length}`);

  if (customerPropertyFailures.length || jobFailures.length) {
    console.log('\nSkipped rows (first 20):');
    [...customerPropertyFailures, ...jobFailures].slice(0, 20).forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((err) => {
  console.error('Fatal import error:', err?.message || err);
  process.exitCode = 1;
});
