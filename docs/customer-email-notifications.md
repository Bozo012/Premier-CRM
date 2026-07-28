# Customer Email Notifications

This repo now sends customer-facing email at the lifecycle points that already
exist as real app actions.

## Trigger points

| Event | Trigger | Template |
| --- | --- | --- |
| Service request submitted | `POST /api/v1/service-requests` | `service-request-confirmation` |
| Site visit scheduled | `updateEstimateStatusAction` when `draft -> site_visit_scheduled` | `site-visit-scheduled` |
| Quote sent | `sendQuoteAction` | `quote-delivery` |
| Invoice sent | `sendInvoiceAction` | `invoice-delivery` |
| Payment recorded | `recordPaymentAction` | `payment-receipt` |

## Runtime environment variables

These emails use the existing Resend setup:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL`

## Product note

This branch intentionally stays narrow and only covers customer emails for
lifecycle steps that already have real mutations in the app today.

Current product decisions:

- **request viewed** is a portal/dashboard status only, not an email
- **estimate created** is not an email step; the customer email happens when the
  quote is actually sent
- **work scheduled** should become its own customer email later, but only after
  the app has a real staff-side scheduling mutation for jobs

That keeps this branch compatible with the later two-path intake work:

- **inspection-first path**: request → viewed (portal only) → site visit scheduled email → quote sent email
- **fast path**: request → viewed (portal only) → quote/invoice flow as needed

## Delivery behavior

Every send is best-effort:

- primary CRM action succeeds first
- email failure never rolls back the underlying request / estimate / job /
  invoice / payment mutation
- callers receive `{ sent: boolean }` behavior and can add UI or logging later
  without changing the workflow contract
