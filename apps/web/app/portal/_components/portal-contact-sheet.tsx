'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, Phone, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { submitPortalContactAction, type SubmitPortalContactActionState } from '../actions';
import {
  contactBlockingReasons,
  emptyPortalContactDraft,
  recordsForCategory,
  type PortalContactDraft,
  type PortalContactViewModel,
} from '../_lib/portal-contact-view-model';

export function PortalContactSheet({ model }: { model: PortalContactViewModel }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'success'>('form');
  const [draft, setDraft] = useState<PortalContactDraft>(emptyPortalContactDraft);
  const [state, formAction, isPending] = useActionState<SubmitPortalContactActionState | null, FormData>(
    submitPortalContactAction,
    null
  );

  const category = model.categories.find((item) => item.id === draft.categoryId);
  const replyMethod = model.replyMethods.find((item) => item.id === draft.replyMethodId);
  const availableRecords = useMemo(
    () => recordsForCategory(model.records, category),
    [category, model.records]
  );
  const relatedRecord = model.records.find((record) => record.id === draft.relatedRecordKey);
  const blockingReasons = contactBlockingReasons(draft, category);

  useEffect(() => {
    if (state?.success) setStep('success');
  }, [state]);

  function openSheet() {
    setDraft(emptyPortalContactDraft());
    setStep('form');
    setOpen(true);
  }

  return (
    <>
      <Button type="button" onClick={openSheet}>
        Contact Premier
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
          <section
            aria-labelledby="portal-contact-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-xl sm:max-w-xl sm:rounded-2xl sm:p-5"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="portal-contact-title" className="text-lg font-semibold tracking-tight">
                  {step === 'success' ? 'Contact request recorded' : step === 'review' ? 'Review your message' : 'Contact Premier'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step === 'success'
                    ? `Reference ${state?.success ? state.data.referenceNumber : ''}`
                    : `Sending as ${model.customerEmail}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close contact form"
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {step === 'form' ? (
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (blockingReasons.length === 0) setStep('review');
                }}
              >
                <ContactFields
                  availableRecords={availableRecords}
                  draft={draft}
                  model={model}
                  onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                />
                {blockingReasons.length > 0 ? <BlockingNotice message={blockingReasons[0] ?? ''} /> : null}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" disabled={blockingReasons.length > 0} className="min-h-11 flex-1">
                    Review message
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-11 flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'review' ? (
              <form action={formAction} className="mt-4 space-y-4">
                <input type="hidden" name="categoryId" value={draft.categoryId} />
                <input type="hidden" name="relatedRecordKey" value={draft.relatedRecordKey} />
                <input type="hidden" name="subject" value={draft.subject} />
                <input type="hidden" name="message" value={draft.message} />
                <input type="hidden" name="replyMethodId" value={draft.replyMethodId} />

                <dl className="space-y-2 rounded-xl bg-muted/60 p-3.5">
                  <ReviewRow label="About" value={category?.label ?? ''} />
                  {relatedRecord ? <ReviewRow label="Related record" value={relatedRecord.label} /> : null}
                  <ReviewRow label="Subject" value={draft.subject} />
                  <ReviewRow label="Reply by" value={replyMethod?.label ?? ''} />
                </dl>
                <p className="whitespace-pre-wrap text-sm text-foreground">{draft.message}</p>
                <p className="text-xs text-muted-foreground">{category?.expectedResponse}</p>
                {state && !state.success ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {state.error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="submit" disabled={isPending} className="min-h-11 flex-1">
                    {isPending ? 'Recording…' : 'Send message'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep('form')} className="min-h-11 flex-1">
                    Back to edit
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'success' && state?.success ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-foreground">Message recorded</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Premier can now see this contact request in the internal activity history.
                    </p>
                  </div>
                </div>
                <dl className="space-y-2 rounded-xl bg-muted/60 p-3.5">
                  <ReviewRow label="Reference" value={state.data.referenceNumber} />
                  <ReviewRow label="About" value={state.data.categoryLabel} />
                  <ReviewRow label="Reply by" value={state.data.replyMethodLabel} />
                </dl>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" onClick={() => setOpen(false)} className="min-h-11 flex-1">
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDraft(emptyPortalContactDraft());
                      setStep('form');
                    }}
                    className="min-h-11 flex-1"
                  >
                    Send another
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ContactFields({
  availableRecords,
  draft,
  model,
  onChange,
}: {
  availableRecords: PortalContactViewModel['records'];
  draft: PortalContactDraft;
  model: PortalContactViewModel;
  onChange: (patch: Partial<PortalContactDraft>) => void;
}) {
  const category = model.categories.find((item) => item.id === draft.categoryId);

  return (
    <>
      <div>
        <label htmlFor="portal-contact-category" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          What is this about <span aria-hidden="true">*</span>
        </label>
        <select
          id="portal-contact-category"
          required
          value={draft.categoryId}
          onChange={(event) => onChange({ categoryId: event.target.value, relatedRecordKey: '' })}
          className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Choose a topic…</option>
          {model.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {category ? <p className="mt-1 text-xs text-muted-foreground">{category.helpText}</p> : null}
      </div>

      {category && category.recordTypes.length > 0 ? (
        <div>
          <label htmlFor="portal-contact-record" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Related record {category.requiresRecord ? <span aria-hidden="true">*</span> : null}
          </label>
          <select
            id="portal-contact-record"
            required={category.requiresRecord}
            value={draft.relatedRecordKey}
            onChange={(event) => onChange({ relatedRecordKey: event.target.value })}
            className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{category.requiresRecord ? 'Choose a record…' : 'No specific record'}</option>
            {availableRecords.map((record) => (
              <option key={record.id} value={record.id}>
                {record.label}
                {record.sublabel ? ` · ${record.sublabel}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Only records from your portal account appear here.</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="portal-contact-subject" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Subject <span aria-hidden="true">*</span>
        </label>
        <input
          id="portal-contact-subject"
          type="text"
          required
          maxLength={120}
          value={draft.subject}
          onChange={(event) => onChange({ subject: event.target.value })}
          placeholder="A short summary"
          className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="portal-contact-message" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Message <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="portal-contact-message"
          required
          maxLength={2000}
          rows={4}
          value={draft.message}
          onChange={(event) => onChange({ message: event.target.value })}
          placeholder="Tell us what you need"
          className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <fieldset>
        <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          How should we reply <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-1.5 space-y-2">
          {model.replyMethods.map((method) => (
            <label key={method.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
              <input
                type="radio"
                name="portal-contact-reply"
                value={method.id}
                required
                checked={draft.replyMethodId === method.id}
                onChange={() => onChange({ replyMethodId: method.id })}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{method.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{method.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-xl bg-muted/60 p-3.5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Prefer to reach us directly?</p>
        <p className="mt-1 flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          {model.business.phone}
        </p>
        <p className="mt-1 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          {model.business.email}
        </p>
        <p className="mt-1">{model.business.hoursLabel}</p>
      </div>
    </>
  );
}

function BlockingNotice({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 text-xs font-semibold text-red-600">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
