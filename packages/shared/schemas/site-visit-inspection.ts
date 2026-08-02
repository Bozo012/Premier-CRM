import { z } from 'zod';

/**
 * Mirrors the field_definitions JSONB shape stored in
 * inspection_template_versions (see supabase/migrations/20260802010400_
 * inspection_templates.sql's seed row). This is the generic,
 * template-driven schema description — NOT hardcoded to the one seeded
 * "General Property Maintenance" template — so a future trade-specific
 * template is a data-only addition, not a code change.
 */
export const InspectionFieldTypeSchema = z.enum([
  'text',
  'longtext',
  'number',
  'measurement_list',
  'quantity_list',
  'material_list',
  'multiselect',
  'boolean',
  'photo_list',
]);
export type InspectionFieldType = z.infer<typeof InspectionFieldTypeSchema>;

export const InspectionFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  type: InspectionFieldTypeSchema,
  label: z.string().min(1),
  helpText: z.string().optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
  displayOrder: z.number(),
  validation: z.object({ min: z.number().optional(), max: z.number().optional(), maxLength: z.number().optional() }).optional(),
  visibility: z.enum(['staff_only', 'internal_and_estimate_source']),
  estimateMappingHint: z.enum(['line_item_quantity', 'line_item_material', 'description_text', 'none']).optional(),
});
export type InspectionFieldDefinition = z.infer<typeof InspectionFieldDefinitionSchema>;

const MAX_TEXT_LENGTH = 5000;
const MAX_LIST_ITEMS = 100;

/**
 * Builds a Zod schema for a single field VALUE, from its field definition.
 * The caller then validates the whole responses object against the map of
 * per-field schemas built from every field in the visit's bound template
 * version — see validateInspectionResponses() below.
 */
function schemaForField(field: InspectionFieldDefinition): z.ZodTypeAny {
  const maxLen = field.validation?.maxLength ?? MAX_TEXT_LENGTH;
  switch (field.type) {
    case 'text':
      return z.string().max(maxLen);
    case 'longtext':
      return z.string().max(maxLen);
    case 'number':
      return z.number().min(field.validation?.min ?? -Infinity).max(field.validation?.max ?? Infinity);
    case 'boolean':
      return z.boolean();
    case 'multiselect':
      return z.array(z.enum((field.options ?? []) as [string, ...string[]])).max(MAX_LIST_ITEMS);
    case 'measurement_list':
      return z.array(z.object({ label: z.string().max(200), value: z.string().max(50), unit: z.string().max(20) })).max(MAX_LIST_ITEMS);
    case 'quantity_list':
      return z.array(z.object({ item: z.string().max(200), quantity: z.number().min(0), unit: z.string().max(20).optional() })).max(MAX_LIST_ITEMS);
    case 'material_list':
      return z.array(z.object({ material: z.string().max(200), estimatedQuantity: z.string().max(100), notes: z.string().max(500).optional() })).max(MAX_LIST_ITEMS);
    case 'photo_list':
      // References into vault_items — the actual row must be verified
      // server-side to belong to the same org/site visit (see
      // validatePhotoReferencesBelongToVisit in the finalization action;
      // Zod alone cannot check DB membership).
      return z.array(z.object({ vaultItemId: z.string().uuid(), caption: z.string().max(300).optional() })).max(MAX_LIST_ITEMS);
    default:
      return z.never();
  }
}

export interface InspectionValidationError {
  field: string;
  message: string;
}

export interface InspectionValidationResult {
  valid: boolean;
  errors: InspectionValidationError[];
  photoVaultItemIds: string[];
}

/**
 * Full template-aware validation of a responses PATCH (partial update) —
 * this is the "trusted server action" layer described in the workflow's
 * validation-boundary design. The RPC (save_site_visit_inspection) only
 * performs coarse checks (shape/size/state); this function is what actually
 * knows the dynamic per-field rules, and must run BEFORE the RPC is called.
 *
 * Unknown keys (not present in the template's field_definitions) are
 * rejected outright — a template only accepts the fields it declares.
 */
export function validateInspectionResponses(
  responsesPatch: Record<string, unknown>,
  fieldDefinitions: InspectionFieldDefinition[]
): InspectionValidationResult {
  const errors: InspectionValidationError[] = [];
  const photoVaultItemIds: string[] = [];
  const fieldsByKey = new Map(fieldDefinitions.map((f) => [f.key, f]));

  for (const key of Object.keys(responsesPatch)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      errors.push({ field: key, message: `Unknown field "${key}" is not part of this inspection template.` });
      continue;
    }
    const schema = schemaForField(field);
    const parsed = schema.safeParse(responsesPatch[key]);
    if (!parsed.success) {
      errors.push({ field: key, message: parsed.error.issues.map((i) => i.message).join('; ') });
      continue;
    }
    if (field.type === 'photo_list') {
      for (const photo of parsed.data as Array<{ vaultItemId: string }>) {
        photoVaultItemIds.push(photo.vaultItemId);
      }
    }
  }

  return { valid: errors.length === 0, errors, photoVaultItemIds };
}

/** Validates that every required field is present across the FULL merged responses object (not just the current patch), for use at completion time. */
export function validateRequiredFieldsPresent(
  fullResponses: Record<string, unknown>,
  fieldDefinitions: InspectionFieldDefinition[]
): InspectionValidationError[] {
  const errors: InspectionValidationError[] = [];
  for (const field of fieldDefinitions) {
    if (!field.required) continue;
    const value = fullResponses[field.key];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      errors.push({ field: field.key, message: `"${field.label}" is required.` });
    }
  }
  return errors;
}
