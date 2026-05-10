'use client'; // Client component required for per-row server action state.

import { useActionState } from 'react';

import type { WebsitePromotionRecord } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  deleteWebsitePromotionAction,
  saveWebsitePromotionAction,
  type DeleteWebsiteContentActionState,
  type SaveWebsitePromotionActionState,
} from '../actions';

interface WebsitePromotionListProps {
  promotions: WebsitePromotionRecord[];
}

function textValue(value: string | null | undefined): string {
  return value ?? '';
}

export function WebsitePromotionList({
  promotions,
}: WebsitePromotionListProps) {
  return (
    <div className="space-y-4">
      {promotions.map((promotion) => (
        <WebsitePromotionCard key={promotion.id} promotion={promotion} />
      ))}
      <WebsitePromotionCard />
    </div>
  );
}

function WebsitePromotionCard({
  promotion,
}: {
  promotion?: WebsitePromotionRecord;
}) {
  const [saveState, saveAction, isSaving] = useActionState<
    SaveWebsitePromotionActionState | null,
    FormData
  >(saveWebsitePromotionAction, null);
  const [deleteState, deleteAction, isDeleting] = useActionState<
    DeleteWebsiteContentActionState | null,
    FormData
  >(deleteWebsitePromotionAction, null);

  return (
    <article className="rounded-lg border bg-background p-4">
      <form action={saveAction} className="space-y-4">
        {promotion ? <input type="hidden" name="id" value={promotion.id} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-medium text-foreground">
            {promotion ? promotion.title : 'Add promotion'}
          </h3>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="active"
              defaultChecked={promotion?.active ?? false}
            />
            Active
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`promotion-title-${promotion?.id ?? 'new'}`}>Title</Label>
            <Input
              id={`promotion-title-${promotion?.id ?? 'new'}`}
              name="title"
              defaultValue={textValue(promotion?.title)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`promotion-order-${promotion?.id ?? 'new'}`}>
              Display order
            </Label>
            <Input
              id={`promotion-order-${promotion?.id ?? 'new'}`}
              name="displayOrder"
              type="number"
              min="0"
              defaultValue={String(promotion?.displayOrder ?? 0)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`promotion-description-${promotion?.id ?? 'new'}`}>
            Description
          </Label>
          <textarea
            id={`promotion-description-${promotion?.id ?? 'new'}`}
            name="description"
            rows={3}
            defaultValue={textValue(promotion?.description)}
            className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`promotion-button-text-${promotion?.id ?? 'new'}`}>
              Button label
            </Label>
            <Input
              id={`promotion-button-text-${promotion?.id ?? 'new'}`}
              name="buttonText"
              defaultValue={textValue(promotion?.buttonText)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`promotion-button-link-${promotion?.id ?? 'new'}`}>
              Button link
            </Label>
            <Input
              id={`promotion-button-link-${promotion?.id ?? 'new'}`}
              name="buttonLink"
              defaultValue={textValue(promotion?.buttonLink)}
              placeholder="/request-service"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`promotion-start-date-${promotion?.id ?? 'new'}`}>
              Start date
            </Label>
            <Input
              id={`promotion-start-date-${promotion?.id ?? 'new'}`}
              name="startDate"
              type="date"
              defaultValue={textValue(promotion?.startDate)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`promotion-end-date-${promotion?.id ?? 'new'}`}>
              End date
            </Label>
            <Input
              id={`promotion-end-date-${promotion?.id ?? 'new'}`}
              name="endDate"
              type="date"
              defaultValue={textValue(promotion?.endDate)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSaving || isDeleting}>
            {isSaving
              ? 'Saving...'
              : promotion
                ? 'Save promotion'
                : 'Create promotion'}
          </Button>

          {promotion ? (
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
          <p className="text-sm text-emerald-700">Promotion saved.</p>
        ) : null}
        {saveState && !saveState.success ? (
          <p className="text-sm text-red-600">{saveState.error}</p>
        ) : null}
        {deleteState?.success ? (
          <p className="text-sm text-emerald-700">Promotion deleted.</p>
        ) : null}
        {deleteState && !deleteState.success ? (
          <p className="text-sm text-red-600">{deleteState.error}</p>
        ) : null}
      </form>
    </article>
  );
}
