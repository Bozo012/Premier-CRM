'use client';

// Client component: modal sheet with local open/step state, driving
// startConversationAction (Customer / Staff Threaded Messaging — replaces
// the old PortalContactSheet one-shot flow). Redirects into the real
// thread once created rather than showing a static "recorded" summary.
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { startConversationAction, type StartConversationActionState } from '../actions';
import {
  PORTAL_CONTACT_CATEGORIES,
  recordsForCategory,
  type PortalContactViewModel,
} from '../_lib/portal-contact-view-model';

interface Draft {
  categoryId: string;
  relatedRecordKey: string;
  subject: string;
  message: string;
}

function emptyDraft(): Draft {
  return { categoryId: '', relatedRecordKey: '', subject: '', message: '' };
}

export function NewConversationSheet({ model }: { model: PortalContactViewModel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [state, formAction, isPending] = useActionState<StartConversationActionState | null, FormData>(
    startConversationAction,
    null
  );

  const category = model.categories.find((item) => item.id === draft.categoryId);
  const availableRecords = useMemo(() => recordsForCategory(model.records, category), [category, model.records]);

  const blockingReasons: string[] = [];
  if (!draft.subject.trim()) blockingReasons.push('Add a short subject.');
  if (!draft.message.trim()) blockingReasons.push('Write your message.');
  if (category?.requiresRecord && !draft.relatedRecordKey) blockingReasons.push('Select the record your question is about.');

  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      router.push(`/portal/messages/${state.data.threadId}`);
    }
  }, [state, router]);

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setDraft(emptyDraft());
          setOpen(true);
        }}
      >
        New conversation
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
          <section
            aria-labelledby="new-conversation-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-xl sm:max-w-xl sm:rounded-2xl sm:p-5"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="new-conversation-title" className="text-lg font-semibold tracking-tight">
                  New conversation
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Sending as {model.customerEmail}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form action={formAction} className="mt-4 space-y-4">
              <input type="hidden" name="categoryId" value={draft.categoryId} />
              <input type="hidden" name="relatedRecordKey" value={draft.relatedRecordKey} />

              <div>
                <label htmlFor="new-convo-category" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  What is this about
                </label>
                <select
                  id="new-convo-category"
                  value={draft.categoryId}
                  onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value, relatedRecordKey: '' }))}
                  className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choose a topic…</option>
                  {PORTAL_CONTACT_CATEGORIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {category ? <p className="mt-1 text-xs text-muted-foreground">{category.helpText}</p> : null}
              </div>

              {category && category.recordTypes.length > 0 ? (
                <div>
                  <label htmlFor="new-convo-record" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Related record {category.requiresRecord ? <span aria-hidden="true">*</span> : null}
                  </label>
                  <select
                    id="new-convo-record"
                    value={draft.relatedRecordKey}
                    onChange={(event) => setDraft((current) => ({ ...current, relatedRecordKey: event.target.value }))}
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
                </div>
              ) : null}

              <div>
                <label htmlFor="new-convo-subject" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Subject <span aria-hidden="true">*</span>
                </label>
                <input
                  id="new-convo-subject"
                  name="subject"
                  type="text"
                  required
                  maxLength={120}
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="A short summary"
                  className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="new-convo-message" className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Message <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="new-convo-message"
                  name="message"
                  required
                  maxLength={5000}
                  rows={4}
                  value={draft.message}
                  onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Tell us what you need"
                  className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {state && !state.success ? (
                <p className="flex items-start gap-2 text-xs font-semibold text-red-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{state.error}</span>
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="submit" disabled={isPending || blockingReasons.length > 0} className="min-h-11 flex-1">
                  {isPending ? 'Sending…' : 'Send'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="min-h-11 flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
