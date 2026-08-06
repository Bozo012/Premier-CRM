'use client';

// Client component: controlled inputs for every real inspection field type
// (text/longtext/number/boolean/multiselect/photo_list/measurement_list/
// quantity_list/material_list). Extracted unchanged from the pre-existing
// flat inspection-form.tsx so the 5-step wizard (inspection-workflow.tsx)
// and any other consumer render every field type identically — no
// duplicated/diverging field-rendering logic.
import type { InspectionFieldDefinition } from '@premier/shared';

import { PhotoUpload } from './photo-upload';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span>Saving…</span>;
  if (state === 'saved') return <span className="text-[hsl(var(--st-success-fg))]">Saved</span>;
  return <span className="text-[hsl(var(--st-error-fg))]">Save failed</span>;
}

export function FieldEditor({
  field,
  value,
  readOnly,
  siteVisitId,
  onChange,
}: {
  field: InspectionFieldDefinition;
  value: unknown;
  readOnly: boolean;
  siteVisitId: string;
  onChange: (value: unknown) => void;
}) {
  const inputId = `field-${field.key}`;
  const label = (
    <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
      {field.label}
      {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
    </label>
  );

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1">
          {label}
          <input
            id={inputId}
            type="text"
            disabled={readOnly}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-70"
          />
        </div>
      );
    case 'longtext':
      return (
        <div className="space-y-1">
          {label}
          <textarea
            id={inputId}
            disabled={readOnly}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm disabled:opacity-70"
          />
        </div>
      );
    case 'number':
      return (
        <div className="space-y-1">
          {label}
          <input
            id={inputId}
            type="number"
            disabled={readOnly}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-70"
          />
          {field.unit ? <p className="text-xs text-muted-foreground">{field.unit}</p> : null}
        </div>
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          {field.label}
        </label>
      );
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {label}
          <div className="flex flex-wrap gap-3">
            {(field.options ?? []).map((option) => (
              <label key={option} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={selected.includes(option)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...selected, option] : selected.filter((o) => o !== option);
                    onChange(next);
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case 'photo_list': {
      const photos = Array.isArray(value) ? (value as { vaultItemId: string; caption?: string }[]) : [];
      return (
        <div className="space-y-2">
          {label}
          {photos.length > 0 ? (
            <p className="text-xs text-muted-foreground">{photos.length} photo(s) attached.</p>
          ) : null}
          {!readOnly ? (
            <PhotoUpload
              siteVisitId={siteVisitId}
              onUploaded={(vaultItemId) => onChange([...photos, { vaultItemId }])}
            />
          ) : null}
        </div>
      );
    }
    case 'measurement_list':
    case 'quantity_list':
    case 'material_list':
      return <ListFieldEditor field={field} value={value} readOnly={readOnly} onChange={onChange} />;
    default:
      return null;
  }
}

/**
 * Human-readable label/placeholder/input-type per raw column key — fixes a
 * real UX defect found in Kevin's Demo UI observation: rows previously
 * showed the raw key name ("value", "unit") as placeholder text only, with
 * no visible label and identical-looking inputs, so a filled-in row like
 * "10 | value | Ft" gave no visual cue which box was which.
 */
const COLUMN_META: Record<string, { label: string; placeholder: string; type: 'text' | 'number'; widthClass: string }> = {
  label: { label: 'Measurement name', placeholder: 'e.g. Deck width', type: 'text', widthClass: 'sm:flex-[2]' },
  value: { label: 'Value', placeholder: 'e.g. 6x8', type: 'text', widthClass: 'sm:flex-1' },
  item: { label: 'Item', placeholder: 'e.g. Deck boards', type: 'text', widthClass: 'sm:flex-[2]' },
  quantity: { label: 'Quantity', placeholder: 'e.g. 3', type: 'number', widthClass: 'sm:flex-1' },
  material: { label: 'Material', placeholder: 'e.g. 5/4x6 PT board', type: 'text', widthClass: 'sm:flex-[2]' },
  estimatedQuantity: { label: 'Estimated quantity', placeholder: 'e.g. 3 boards (12ft)', type: 'text', widthClass: 'sm:flex-[2]' },
  notes: { label: 'Notes', placeholder: 'Optional', type: 'text', widthClass: 'sm:flex-[2]' },
  unit: { label: 'Unit', placeholder: 'e.g. ft', type: 'text', widthClass: 'sm:flex-1' },
};

export function ListFieldEditor({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: InspectionFieldDefinition;
  value: unknown;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}) {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const columns = columnsForListType(field.type);
  const numericColumns = field.type === 'quantity_list' ? ['quantity'] : [];

  const updateRow = (index: number, columnKey: string, columnValue: string) => {
    const parsedValue: unknown = numericColumns.includes(columnKey) ? Number(columnValue) : columnValue;
    const next = rows.map((row, i) => (i === index ? { ...row, [columnKey]: parsedValue } : row));
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, {}]);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const listLabelId = `field-${field.key}-label`;
  return (
    <div className="space-y-2">
      <label id={listLabelId} className="block text-sm font-medium text-foreground">
        {field.label}
        {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      <div className="space-y-3" role="group" aria-labelledby={listLabelId}>
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              {columns.map((col) => {
                const meta = COLUMN_META[col] ?? { label: col, placeholder: col, type: 'text' as const, widthClass: 'sm:flex-1' };
                const rowInputId = `field-${field.key}-${i}-${col}`;
                return (
                  <div key={col} className={`min-w-0 ${meta.widthClass}`}>
                    <label htmlFor={rowInputId} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </label>
                    <input
                      id={rowInputId}
                      type={meta.type}
                      inputMode={meta.type === 'number' ? 'decimal' : undefined}
                      placeholder={meta.placeholder}
                      disabled={readOnly}
                      value={(row[col] as string) ?? ''}
                      onChange={(e) => updateRow(i, col, e.target.value)}
                      className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm disabled:opacity-70"
                    />
                  </div>
                );
              })}
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove row
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!readOnly ? (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex h-9 items-center text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          + Add row
        </button>
      ) : null}
    </div>
  );
}

function columnsForListType(type: InspectionFieldDefinition['type']): string[] {
  if (type === 'measurement_list') return ['label', 'value', 'unit'];
  if (type === 'quantity_list') return ['item', 'quantity', 'unit'];
  if (type === 'material_list') return ['material', 'estimatedQuantity', 'notes'];
  return [];
}
