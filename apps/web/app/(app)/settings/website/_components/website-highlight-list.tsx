'use client'; // Client component required for per-row server action state.

import { useActionState } from 'react';

import type { WebsiteServiceHighlightRecord } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  deleteWebsiteServiceHighlightAction,
  saveWebsiteServiceHighlightAction,
  type DeleteWebsiteContentActionState,
  type SaveWebsiteServiceHighlightActionState,
} from '../actions';

interface WebsiteHighlightListProps {
  highlights: WebsiteServiceHighlightRecord[];
}

function textValue(value: string | null | undefined): string {
  return value ?? '';
}

export function WebsiteHighlightList({
  highlights,
}: WebsiteHighlightListProps) {
  return (
    <div className="space-y-4">
      {highlights.map((highlight) => (
        <WebsiteHighlightCard key={highlight.id} highlight={highlight} />
      ))}
      <WebsiteHighlightCard />
    </div>
  );
}

function WebsiteHighlightCard({
  highlight,
}: {
  highlight?: WebsiteServiceHighlightRecord;
}) {
  const [saveState, saveAction, isSaving] = useActionState<
    SaveWebsiteServiceHighlightActionState | null,
    FormData
  >(saveWebsiteServiceHighlightAction, null);
  const [deleteState, deleteAction, isDeleting] = useActionState<
    DeleteWebsiteContentActionState | null,
    FormData
  >(deleteWebsiteServiceHighlightAction, null);

  return (
    <article className="rounded-lg border bg-background p-4">
      <form action={saveAction} className="space-y-4">
        {highlight ? <input type="hidden" name="id" value={highlight.id} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-medium text-foreground">
            {highlight ? highlight.title : 'Add service highlight'}
          </h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={highlight?.featured ?? false}
              />
              Featured
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="active"
                defaultChecked={highlight?.active ?? false}
              />
              Active
            </label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`highlight-title-${highlight?.id ?? 'new'}`}>Title</Label>
            <Input
              id={`highlight-title-${highlight?.id ?? 'new'}`}
              name="title"
              defaultValue={textValue(highlight?.title)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`highlight-order-${highlight?.id ?? 'new'}`}>
              Display order
            </Label>
            <Input
              id={`highlight-order-${highlight?.id ?? 'new'}`}
              name="displayOrder"
              type="number"
              min="0"
              defaultValue={String(highlight?.displayOrder ?? 0)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`highlight-slug-${highlight?.id ?? 'new'}`}>Slug</Label>
          <Input
            id={`highlight-slug-${highlight?.id ?? 'new'}`}
            name="slug"
            defaultValue={textValue(highlight?.slug)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`highlight-description-${highlight?.id ?? 'new'}`}>
            Description
          </Label>
          <textarea
            id={`highlight-description-${highlight?.id ?? 'new'}`}
            name="description"
            rows={3}
            defaultValue={textValue(highlight?.description)}
            className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSaving || isDeleting}>
            {isSaving
              ? 'Saving...'
              : highlight
                ? 'Save highlight'
                : 'Create highlight'}
          </Button>

          {highlight ? (
            <Button
              type="submit"
              variant="outline"
              formAction={deleteAction}
              disabled={isSaving || isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          ) : null}
        </div>

        {saveState?.success ? (
          <p className="text-sm text-emerald-700">Service highlight saved.</p>
        ) : null}
        {saveState && !saveState.success ? (
          <p className="text-sm text-red-600">{saveState.error}</p>
        ) : null}
        {deleteState?.success ? (
          <p className="text-sm text-emerald-700">Service highlight deleted.</p>
        ) : null}
        {deleteState && !deleteState.success ? (
          <p className="text-sm text-red-600">{deleteState.error}</p>
        ) : null}
      </form>
    </article>
  );
}
