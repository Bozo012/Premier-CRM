'use client'; // Client component required for interactive server action feedback.

import { useActionState } from 'react';

import type { WebsiteSettingsRecord } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  saveWebsiteSettingsAction,
  type SaveWebsiteSettingsActionState,
} from '../actions';

interface WebsiteSettingsFormProps {
  settings: WebsiteSettingsRecord | null;
}

function textValue(value: string | null | undefined): string {
  return value ?? '';
}

function TextAreaField(props: {
  defaultValue?: string;
  id: string;
  label: string;
  name: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <textarea
        id={props.id}
        name={props.name}
        defaultValue={props.defaultValue}
        rows={props.rows ?? 3}
        className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

export function WebsiteSettingsForm({ settings }: WebsiteSettingsFormProps) {
  const [state, formAction, isPending] = useActionState<
    SaveWebsiteSettingsActionState | null,
    FormData
  >(saveWebsiteSettingsAction, null);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-phone-display">Public phone display</Label>
          <Input
            id="website-phone-display"
            name="phoneDisplay"
            defaultValue={textValue(settings?.phoneDisplay)}
            placeholder="(859) 912-0526"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website-phone-e164">Public phone E.164</Label>
          <Input
            id="website-phone-e164"
            name="phoneE164"
            defaultValue={textValue(settings?.phoneE164)}
            placeholder="+18599120526"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="website-call-cta">Call CTA label</Label>
          <Input
            id="website-call-cta"
            name="callCtaLabel"
            defaultValue={textValue(settings?.callCtaLabel)}
            placeholder="Call Now"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website-text-cta">Text CTA label</Label>
          <Input
            id="website-text-cta"
            name="textCtaLabel"
            defaultValue={textValue(settings?.textCtaLabel)}
            placeholder="Text Us"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website-request-cta">Request-service CTA label</Label>
          <Input
            id="website-request-cta"
            name="requestServiceCtaLabel"
            defaultValue={textValue(settings?.requestServiceCtaLabel)}
            placeholder="Request Service"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website-portal-cta">Portal CTA label</Label>
          <Input
            id="website-portal-cta"
            name="portalCtaLabel"
            defaultValue={textValue(settings?.portalCtaLabel)}
            placeholder="Request Your First Service"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-hero-headline">Hero headline</Label>
          <Input
            id="website-hero-headline"
            name="heroHeadline"
            defaultValue={textValue(settings?.heroHeadline)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website-availability-text">Availability text</Label>
          <Input
            id="website-availability-text"
            name="availabilityText"
            defaultValue={textValue(settings?.availabilityText)}
            placeholder="Available 24/7"
          />
        </div>
      </div>

      <TextAreaField
        id="website-hero-subheadline"
        label="Hero subheadline"
        name="heroSubheadline"
        defaultValue={textValue(settings?.heroSubheadline)}
      />

      <TextAreaField
        id="website-service-area-summary"
        label="Service-area summary"
        name="serviceAreaSummary"
        defaultValue={textValue(settings?.serviceAreaSummary)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <TextAreaField
          id="website-emergency-message"
          label="Emergency / final CTA message"
          name="emergencyMessage"
          defaultValue={textValue(settings?.emergencyMessage)}
        />

        <TextAreaField
          id="website-portal-status-message"
          label="Portal status message"
          name="portalStatusMessage"
          defaultValue={textValue(settings?.portalStatusMessage)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website-homepage-seo-title">Homepage SEO title</Label>
          <Input
            id="website-homepage-seo-title"
            name="homepageSeoTitle"
            defaultValue={textValue(settings?.homepageSeoTitle)}
          />
        </div>

        <TextAreaField
          id="website-homepage-seo-description"
          label="Homepage SEO description"
          name="homepageSeoDescription"
          defaultValue={textValue(settings?.homepageSeoDescription)}
          rows={4}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving settings...' : 'Save website settings'}
      </Button>

      {state?.success ? (
        <p className="text-sm text-emerald-700">
          Website settings saved. Updated at {state.data.updatedAt}.
        </p>
      ) : null}
      {state && !state.success ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
