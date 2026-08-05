'use client';

// Client component: mobile-first form with debounced autosave per field —
// requires local input state and timers, can't be a server component.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { InspectionFieldDefinition } from '@premier/shared';

import { saveSiteVisitInspectionAction, completeSiteVisitWithValidationAction } from '../actions';
import { PhotoUpload } from './photo-upload';

interface InspectionFormProps {
  siteVisitId: string;
  fieldDefinitions: InspectionFieldDefinition[];
  initialResponses: Record<string, unknown>;
  readOnly: boolean;
  returnToVisitOnComplete?: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_DELAY_MS = 1200;

export function InspectionForm({
  siteVisitId,
  fieldDefinitions,
  initialResponses,
  readOnly,
  returnToVisitOnComplete = false,
}: InspectionFormProps) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, unknown>>(initialResponses);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isCompleting, setIsCompleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedFields = [...fieldDefinitions].sort((a, b) => a.displayOrder - b.displayOrder);

  const scheduleAutosave = (key: string, value: unknown) => {
    if (readOnly) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void (async () => {
        setSaveState('saving');
        const result = await saveSiteVisitInspectionAction(siteVisitId, fieldDefinitions, { [key]: value });
        setSaveState(result.success ? 'saved' : 'error');
        if (!result.success) toast.error(result.error ?? 'Autosave failed.');
      })();
    }, AUTOSAVE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const updateField = (key: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
    scheduleAutosave(key, value);
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    const result = await completeSiteVisitWithValidationAction(siteVisitId, fieldDefinitions, responses);
    setIsCompleting(false);
    if (result.success) {
      toast.success('Inspection completed.');
      if (returnToVisitOnComplete) router.push(`/site-visits/${siteVisitId}`);
      else router.refresh();
    } else {
      toast.error(result.error ?? 'Cannot complete: some required fields are missing.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {readOnly ? 'Findings locked (visit completed).' : <SaveIndicator state={saveState} />}
        </p>
      </div>

      <div className="space-y-4">
        {sortedFields.map((field) => (
          <FieldEditor
            key={field.key}
            field={field}
            value={responses[field.key]}
            readOnly={readOnly}
            siteVisitId={siteVisitId}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      {!readOnly ? (
        <button
          type="button"
          onClick={handleComplete}
          disabled={isCompleting}
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {isCompleting ? 'Completing…' : 'Complete inspection'}
        </button>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span>Saving…</span>;
  if (state === 'saved') return <span className="text-[hsl(var(--st-success-fg))]">Saved</span>;
  return <span className="text-[hsl(var(--st-error-fg))]">Save failed</span>;
}

function FieldEditor({
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
  const label = (
    <label className="block text-sm font-medium text-foreground">
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
      return (
        <ListFieldEditor field={field} value={value} readOnly={readOnly} onChange={onChange} />
      );
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

function ListFieldEditor({
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

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {field.label}
        {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              {columns.map((col) => {
                const meta = COLUMN_META[col] ?? { label: col, placeholder: col, type: 'text' as const, widthClass: 'sm:flex-1' };
                return (
                  <div key={col} className={`min-w-0 ${meta.widthClass}`}>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </label>
                    <input
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
