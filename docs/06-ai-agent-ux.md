# AI Agent UX — Phase 2 North Star

This document is a **target specification**, not an implementation plan. It captures
what the agent layer of Premier CRM should look and feel like once Phase 2 ships.
The reference point is Polsia (https://polsia.com), an autonomous-agent dashboard
product Kevin trialed in 2026-04. Polsia gets the UX framing right in ways our
build sequence already supports architecturally — most of the substance is already
on the roadmap; this doc names the target so we don't design it from scratch when
we get there.

Use this doc when:

- Designing or wireframing any agent-facing surface
- Deciding what to pull forward into Phase 1.5 vs defer to Phase 2
- Reviewing whether a Phase 2 PR matches the intended UX
- Onboarding a future contributor (or another Claude conversation) to the agent layer

Read in order: the deconstruction first, then the architectural mapping, then the
adoption decisions, then the implementation order.

---

## Why Polsia is the reference

Polsia is a generic "AI runs your company" SaaS. Its substance is a Claude wrapper
with tool use, a queue/scheduler, and a database for tasks/docs/business state. The
LLM and the integrations are not the interesting part — what's interesting is the
**framing**: the dashboard makes the agent feel like a junior employee reporting
in, not like a chatbot that occasionally does things. The framing is what we want
to copy. The integrations we'll build at our own pace, scoped to contracting.

Premier CRM's domain (one solo contractor, scaling to a small team, one industry)
is narrower than Polsia's (any business, any industry). Narrower domain means we
can ship higher-quality versions of the same patterns: better prompts, fewer false
positives, more useful summaries, deeper integration with our actual data.

---

## Polsia, deconstructed

These are the surfaces visible in Polsia's dashboard, each with what it does and
how it's mechanically implemented (inferred from the screenshot and from product
behavior).

### Top bar — terminal activity log

A scrolling tail of the agent's recent tool-call results, formatted as monospace
terminal output:

```
> Summary email sent
> Sending inbox message...
> Message sent to company inbox
> Saving report: Day 2 Summary...
> Report #627373 saved
```

**Mechanism:** server-sent events stream of the agent's last N tool-execution
events, rendered as monospace lines with leading `>`. Each line is one entry from
an agent-actions audit log.

**Purpose:** communicates "the AI is working right now" without requiring the user
to be in the chat. Cheap UX; high impact on perceived autonomy.

### Left rail — agent identity panel

- **Status badge with vibe-coded subtitle.** Polsia shows three flame emojis and
  "Crushing It / Shipping features, managing queue, system healthy." The status is
  derived from agent productivity over the last 24 hours: tasks completed, errors
  encountered, blocked items. Mapped to a small set of named states (Crushing It /
  Steady / Stuck / Cooling Off).
- **Pixel-art mascot.** Pure brand. No mechanical function.
- **God Mode button.** A high-priority direct-line into the agent — bypasses the
  task queue, opens a "do this thing now" prompt with elevated trust. Implementation
  is essentially a chat input flagged `priority: god_mode` that skips queue
  ordering.

### Left rail — business panel

- **Visitors / Revenue / Setup payments.** Lightweight metrics widget. Visitors
  comes from a first-party analytics ping (e.g. Plausible, Vercel Analytics, or a
  homegrown event log). Revenue comes from Stripe. "Setup payments" is a CTA when
  Stripe isn't configured.
- **Updated N ago + refresh.** Cached value, manually invalidatable.

### Center column — tasks

A kanban-style list of cards, each tagged by category and (optionally) schedule:

- *Build admin inquiry dashboard at /admin/inquiries* — Engineering, Tonight
- *Add local business Schema.org structured data and SEO meta tags* — Engineering
- *Find 10 Property Managers Who Need a Reliable Handyman Partner* — Cold Outreach

**Mechanism:** the agent generates its own tasks. A planning loop runs periodically
(probably daily) with a prompt along the lines of: "Given the org's current state,
goals, and inbox, what should be in the queue this week?" Output is parsed into
task records with title, body, category, and optional scheduling. Categories are
the action types the agent has tools for (Engineering, Cold Outreach, Content,
Customer Communication, etc.). Status flows through Pending → In Progress →
Blocked / Done.

**Mechanism distinction from rule-based automation:** Polsia's tasks are
LLM-generated, soft, strategic, and may never execute automatically. Our existing
automation engine (migration 0005) is rule-based, deterministic, and event-driven.
Both should coexist — see Adoption decisions below.

### Center column — documents

A short stack of dated, agent-written documents:

- Day 2 Summary
- Day 1 Evening Update
- Day 1 Summary

Each is a persistent artifact with a title and timestamp, openable for full text.

**Mechanism:** the agent writes summary docs at scheduled checkpoints (end of day,
end of evening, end of week) using a synthesis prompt against the day's tool calls,
completed tasks, errors, new vault items, and incoming customer messages. Output
is saved to a documents store. Surfaced in the dashboard sorted by recency.

### Center column — links

A short list of project URLs the agent maintains:

- Premier property maintenance → https://premier-property-maintenance.polsia.app

**Mechanism:** trivial. A free-form list of named URLs, owner-editable.

### Right column — outbound channels

Three communication surfaces the agent operates as a peer:

**Twitter (@polsia)** — the agent composes tweets, queued for review or
auto-publish depending on policy. Implementation: tool definitions for
`compose_tweet`, `publish_tweet`. The agent's voice is configured per-org.

**Email — agent has its own address.** In Polsia, this address is
`premier-property-maintenance@polsia.app`. The agent can send outbound and receive
inbound at this address. Counter at the bottom: "1 sent · 0 received". This is the
single most distinctive pattern in the product. The agent functions as a coworker
with its own inbox, not as a feature buried inside the user's inbox.

**Ads — Run Ads button.** Placeholder. Real implementation requires Meta/Google
Ads API access and spend authorization. Out of scope for an early build.

### Right column — daily narrative log

The standout feature. Not a dashboard of stats but a chronological feed of
agent-written prose summaries, dated, with sub-sections for what shipped, what's
blocked, what's queued, and direct questions back to the user.

Sample (Polsia, Day 1):

> **Day 1 done.** Landing page redesigned and live at
> https://premier-property-maintenance.polsia.app
>
> ✓ Dark workman's aesthetic, bold typography, correct phone and booking link
> ✓ Content rewritten — landlord positioning, 8 services, NKY service area, no
>   more SaaS language
> ✓ QA'd and verified — all links working, mobile-friendly
>
> **Up next:** Quote request form (capture leads 24/7) and local SEO structured
> data (get visible on Google).

Sample (Polsia, Day 2, with question):

> **Happy Sunday, Kevin.** That QA report flagged 5 fixes — did you get a chance
> to update the phone number and sort out those button links?

**Mechanism:** at scheduled checkpoints, the agent runs a synthesis prompt against
its work log and produces second-person prose. Stored as a daily-briefing record.
Surfaced sorted by date. The "questions back to the user" are emitted by the prompt
and tracked as separate prompt records so the user's eventual answer can be linked
back to the question.

This format works because it feels like a junior employee's end-of-day Slack
message. Most dashboards fail by showing numbers; this succeeds by showing
**narrative**.

### Bottom — chat input

`Ask Polsia anything...` — the conversational entry point. Standard tool-calling
chat with the full agent toolkit. Conversations persist; tool calls are logged.

---

## Architectural mapping to Premier CRM

Most of Polsia's substance maps to features already in the build sequence. The
mapping is closer than the visual difference suggests.

| Polsia feature                          | Premier CRM status                                 | Reference                          |
|-----------------------------------------|----------------------------------------------------|------------------------------------|
| Terminal activity log                   | Need a thin UI; data exists                        | New PR, small                      |
| Status / vibe panel                     | New UI; needs a vibe-computation function          | Phase 2 polish                     |
| Business metrics widget                 | Today screen has counts; add visitors + revenue    | Phase 1 Week 6 (Stripe) + new      |
| Agent-generated task queue              | `tasks` table exists; need agent-planning loop     | Phase 2, new                       |
| Daily / evening narrative summaries     | `daily_briefings` table exists                     | Phase 2 Week 14 ✓                  |
| Documents list                          | `vault_items` table covers this                    | Phase 1 Week 8 ✓                   |
| Agent's own email address (in + out)    | Resend planned; inbound webhook planned            | Phase 2 Week 9 ✓ (with extension)  |
| Twitter integration                     | Not in plan                                        | Defer until clear value            |
| Ads integration                         | Not in plan                                        | Defer; expensive                   |
| AI assistant chat                       | Already planned                                    | Phase 2 Week 10–11 ✓               |
| Pixel-art mascot / brand chrome         | Pure UI                                            | Whenever                           |

**Coverage**: roughly 70% of Polsia's substance is already in our Phase 2 plan.
The remaining 30% is either UI we haven't built yet (terminal log, vibe panel,
agent-dashboard layout) or features outside our domain (Twitter, ads).

---

## Adoption decisions

### Adopt verbatim

These four patterns are unambiguous wins and should be in the Phase 2
implementation:

1. **Agent has its own email address.** Add `agent@mail.ppmnky.com` (or `premier@`
   or `assistant@` — name to be decided). Inbound emails to that address parse via
   Resend's inbound API, land in `communications`, trigger agent classification.
   The agent decides reply / escalate / ignore. Outbound from this address for
   anything the agent initiates (cold outreach, customer follow-ups, status
   updates). Customer inquiries that come into this address get a real reply, not
   a "we got your message" autoresponder.

2. **Self-generated task queue, not just rule-based automation.** Add an LLM
   planning loop that produces strategic tasks (cold outreach lists, content
   ideas, "you haven't called Mary in 4 months"). Coexists with the existing
   rule-based automation engine — both populate the same `tasks` table. Rules
   handle deterministic stuff (geofence triggers, scheduled invoicing reminders);
   the agent loop handles strategic stuff.

3. **Narrative daily summaries, not bullet dashboards.** Adopt the prose format
   directly. Daily briefings should write second-person prose to Kevin in the voice
   of a junior employee reporting in. Sub-sections: what shipped, what blocked,
   what's queued, direct questions back. The questions back are first-class —
   tracked as `user_prompts` records (already in schema) so answers can be linked.

4. **Agent dashboard as the today screen.** The current today screen becomes the
   agent control panel: status panel, task queue, documents, comm channels, day
   log, chat input. The existing customer/job widgets stay accessible but become
   secondary surfaces. This is where the user spends most of their morning.

### Adapt

These are good ideas but need rethinking for our domain or our scale:

1. **Vibe panel.** Adopt the concept (one-line momentum indicator) but replace
   "Crushing It" with something that fits a contractor business. Examples:
   "On Track" / "Behind on Quotes" / "Heads-Up: Materials Overage" / "Quiet Day."
   The state should reflect operational reality, not abstract productivity.

2. **Terminal activity log.** Adopt the visual pattern, but feed it from our
   actual events: automation engine events, AI tool executions, capture-pipeline
   completions, payment webhooks. Surface only events the user benefits from
   seeing — don't include every internal log line.

3. **God Mode button.** Defer until there's a real reason for it. The pattern is
   "elevated-priority chat input that bypasses the queue" — we don't need a
   dedicated button until the queue exists and gets clogged enough to need a
   bypass.

### Don't build

These are not worth chasing:

1. **Twitter integration.** Cost: Twitter API ($100+/mo since 2023) plus dev time.
   Value for a Northern Kentucky handyman business: near zero. Customers don't
   find handymen through Twitter. Skip.

2. **Ads integration.** Cost: Meta/Google Ads APIs plus spend authorization plus
   dev time. Value: real, but only after the rest of the agent is mature enough
   to make spending decisions worth trusting. Defer to Phase 4 or later, and only
   if there's a clear ROI signal from existing channels.

3. **Pixel-art mascot.** Fun. Not a use of time. Skip until the rest is built and
   we want a brand polish session.

4. **Polsia's exact landing-page-deployment integration.** The agent shouldn't
   rebuild Kevin's marketing site — that's the design team's job (or the other
   Claude conversation Kevin runs in parallel). The agent reads the live site
   for context but doesn't redeploy it.

---

## What's already on our Phase 2 roadmap

Cross-reference for `docs/03-build-sequence.md`. The relevant Phase 2 work is:

- **Week 9 — Inbound communications.** Twilio SMS webhook, Resend inbound email
  parsing, communications threading, capture into vault. *This is where the
  agent's own email address lands* — the Resend inbound webhook needs a route
  that recognizes the agent's address as a special case and routes through agent
  triage instead of as a customer-attached communication.
- **Week 10 — Assistant chat infrastructure.** Chat UI, conversation persistence,
  tool dispatch, read-tool handlers, streaming, context loading. *This is where
  the conversational layer lands.*
- **Week 11 — Assistant write tools.** Create/update tools, confirmation flow,
  audit log, undo. *This is where the agent gains the ability to act, not just
  observe.*
- **Week 12 — Location + automation engine.** Geofence CRUD, hierarchical prefs,
  tracking, automation default rules, user prompt inbox. *The user prompt inbox
  is the data layer underneath the "questions back to the user" feature.*
- **Week 13 — Customer portal polish.** Magic link tokens, customer portal,
  customer messaging from portal. *The agent reads/sends customer-portal messages
  via this surface.*
- **Week 14 — Daily briefing.** Briefing generator, delivery, anomaly detection,
  opportunity surfacing, end-of-day summary. *This is the narrative-summary
  feature.*

The agent dashboard UI (today-screen replacement) doesn't have a dedicated week
in the build sequence. It should be added between Week 13 and Week 14, or
consolidated into Week 14 once briefing generation is online.

### Pulling work forward into Phase 1.5

Two specific pieces are worth pulling forward, ahead of the planned Phase 2 timing,
because they unlock leverage cheaply and don't depend on the rest of the agent:

1. **Agent email address — inbound webhook only.** Once Resend is verified for
   `mail.ppmnky.com`, add `agent@mail.ppmnky.com` and a Resend inbound webhook that
   lands inbound mail in `communications`. Cost: roughly half a day. The agent
   itself doesn't need to be online; the messages just need to be captured so
   when the agent ships in Phase 2, there's already a backlog to work from.

2. **Tasks table UI — list/kanban view on today screen.** The `tasks` table
   already exists in the schema. A simple list/kanban view, manually populated for
   now, lets Kevin start using it as a personal todo list. When the agent ships,
   it inherits the same surface and starts adding cards. Cost: roughly one day.

Don't pull the agent-planning loop, the daily-summary generator, or the chat
input forward. Those are real Phase 2 work and shipping them half-baked is worse
than not having them.

---

## Open questions

These need answers before Phase 2 implementation starts. Capture decisions in
`DECISIONS.md` as they're made.

1. **Agent email local-part.** `agent@mail.ppmnky.com`, `assistant@`, `premier@`,
   something else? Affects branding and how customers perceive replies. Decision
   gate: before Resend domain verification ships.

2. **Vibe state vocabulary.** What are the named states? Suggested set: On Track,
   Steady, Heads Up, Stuck. Mapping rules from operational data to states?
   Decision gate: before vibe panel UI ships.

3. **Task categories.** Polsia uses Engineering / Cold Outreach / Content. Our
   set should fit contracting: Customer Follow-up / Quoting / Outreach / Admin /
   Field Work / Personal. Decision gate: before task UI ships.

4. **Daily summary cadence and timing.** Polsia does morning + evening + day-end.
   For a single contractor, evening (around 6–9pm) is probably enough as the main
   summary, with a morning briefing (5:30am, already in the build sequence) for
   the next-day plan. Two summaries per day, not three. Decision gate: before
   briefing generator ships.

5. **Agent autonomy boundary.** What can the agent do without confirmation?
   Suggested defaults: read everything; write internal notes/tasks; never send
   external email/SMS without a confirmation step (initially); never accept money
   or commit Kevin to anything. Decision gate: before assistant write tools ship.

6. **Chat history visibility.** Is the agent's chat shared with the team
   (employees see what Kevin asked) or per-user? For a 1–3 person operation, team
   visibility is probably fine and aids transparency. Decision gate: before
   assistant chat ships.

7. **Document store choice.** Polsia surfaces "documents" as a flat list of dated
   summaries. We have `vault_items` (rich, typed, embedded) and `daily_briefings`
   (one per day). Should the dashboard "documents" list pull from `vault_items`
   filtered by `type='note', generator='agent'`, or from `daily_briefings` only,
   or a union? Decision gate: before agent dashboard UI ships.

8. **Self-generated task review gate.** When the agent generates a new task, does
   it land in the queue immediately or in a "for review" lane? Suggested:
   immediate for low-stakes (drafting an email, researching a contact); review
   gate for anything that touches money or external parties. Decision gate:
   before agent planning loop ships.

---

## What this doc is not

- Not an implementation plan. The build sequence (`docs/03-build-sequence.md`)
  remains the source of truth for ordering and timing.
- Not a UI spec. Specific component shapes, color choices, and layouts are TBD.
  This doc captures **what** to build and **why**; the visual design lands
  alongside the implementation PRs.
- Not locked. Polsia is a moving target and our understanding of what Kevin
  actually needs from an agent will sharpen as Phase 1 finishes and real customer
  data accumulates. Revisit this doc at the Phase 1 → Phase 2 boundary.

---

## Appendix — references

- Polsia: https://polsia.com
- Polsia dashboard for Premier: https://polsia.com/dashboard/premier-property-maintenance
- Premier-on-Polsia landing page: https://premier-property-maintenance.polsia.app
- Existing build sequence: `docs/03-build-sequence.md`
- Existing capture pipeline (covers the vault and embedding flow underneath the
  agent's document store): `docs/02-capture-pipeline.md`
- Existing automation UX (covers the rule-based engine the agent's planner
  coexists with): `docs/04-location-and-automation-ux.md`
- Decision log: `DECISIONS.md`
