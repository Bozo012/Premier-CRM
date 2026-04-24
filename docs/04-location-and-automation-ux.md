# Location & Automation — UX Specification

How location tracking, geofences, and automation are presented and controlled in the Premier interface. The design principle: **location is a first-class signal everywhere, and every behavior is controllable at the right level of granularity.**

## Design principles

1. **Ambient, never in the way.** Location context is always visible if you want it, never demanding attention if you don't.
2. **Proposed, not imposed.** The system drafts time entries, suggests classifications, prompts for actions — but the user is always in control. Nothing silently changes billing or sends messages without either a rule the user created or an approval.
3. **Editable in place.** Any auto-generated data (time entries, trip purposes, geofence boundaries) can be corrected with one tap from where it's visible.
4. **Customizable at every level.** Preferences cascade: org → user → customer → job. Override where needed, inherit everywhere else.
5. **Plain-English rules.** Automation rules are shown in natural sentences, not JSON. The JSON exists; the user never has to look at it.

## The five key surfaces

### 1. The "today" home screen (mobile app)

The landing screen when you open the app. Always location-aware.

```
┌────────────────────────────────────────────┐
│  Thursday, April 23                        │
│                                            │
│  📍 At Henderson property                  │
│  ⏱ On the clock · 2h 14m                   │
│  ────────────────────────────────────────  │
│                                            │
│  NEXT UP                                   │
│  Thompson property · 3:30pm                │
│  14 min drive · Leave by 3:16pm            │
│                                            │
│  TODAY'S ACTIVITY                          │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ 🏠 Home → Henderson                  │  │
│  │ 8:14am · 23 min · 14.3 mi  ✓         │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ 📍 Henderson property                │  │
│  │ 8:47am → running · 2h 14m            │  │
│  │ Henderson basement drywall           │  │
│  │ [Photos · 4]  [Notes · 2]  [Edit]    │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌─ Suggested ──────────────────────┐      │
│  │ 💡 Customer hasn't been texted    │      │
│  │    about arrival. Send one now?   │      │
│  │    [Send]  [Not needed]           │      │
│  └──────────────────────────────────┘      │
│                                            │
│  [🎙 Quick record]  [📷 Photo]  [📝 Note]  │
└────────────────────────────────────────────┘
```

Key elements:
- **Top status strip** — always shows current location context. If at a property, shows the property and running time entry.
- **Next up card** — only appears if there's a scheduled next job, with live ETA and "leave by" time.
- **Today's activity** — chronological list of auto-tracked segments. Each is tappable to edit. Checkmarks show confirmed segments; unconfirmed ones have a subtle dot.
- **Suggested actions** — automation prompts appear inline as cards, not modal interrupts. Dismissable.
- **Quick capture row** — always-visible buttons for recording, photo, note. Captures get auto-tagged to current location/job.

### 2. Property detail — the geofence editor

When you tap into a property, one of the sections is an interactive map.

```
┌────────────────────────────────────────────┐
│  ← Emily's house                           │
│     1247 Maple Ln, Ft Wright, KY 41011     │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │                                      │  │
│  │         [Satellite map view]         │  │
│  │             ● Property               │  │
│  │         ⊙ 75m geofence               │  │
│  │                                      │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
│  📐 Geofence                               │
│  Size: ─────●───── 75m  [Edit]            │
│  Center: Use property address  [Move pin]  │
│                                            │
│  🔔 Customer preferences                   │
│  Arrival text: ✓ 30 min before             │
│  Quiet hours: 9:00pm – 7:00am              │
│  Bill drive time: ✗                        │
│  Home sensitive: ✗                         │
│  [Edit customer prefs]                     │
│                                            │
│  🚫 Hide from auto-tracking                │
│     (for personal friend / family visits)  │
│                                            │
│  📚 HISTORY AT THIS PROPERTY               │
│  12 jobs · 47 hrs · 318 miles              │
│  Last visit: March 18                      │
│  [View all]                                │
└────────────────────────────────────────────┘
```

The geofence circle is draggable. The radius slider resizes it in real time. Moving the center pin handles rural properties where the geocoded address is a driveway entrance rather than the house.

The "Hide from auto-tracking" toggle is the escape hatch for personal friends/family addresses that happen to be in the system for other reasons.

### 3. Customer detail — customer-level preferences

Every customer page has a "Location & notifications" section:

```
┌────────────────────────────────────────────┐
│  ← Emily Henderson                         │
│                                            │
│  LOCATION & NOTIFICATIONS                  │
│                                            │
│  Geofence size for this customer           │
│  [ Inherit default (75m) ▾ ]               │
│                                            │
│  When I'm heading to Emily                 │
│  ┌────────────────────────────────────┐   │
│  │ Send "on the way" text             │   │
│  │   [ ✓ Yes ] at [ 30 min ▾ ] out    │   │
│  └────────────────────────────────────┘   │
│                                            │
│  When I arrive                             │
│  ┌────────────────────────────────────┐   │
│  │ Send arrival notification          │   │
│  │   [ ✓ Yes ]                        │   │
│  │ Unless it's quiet hours for Emily: │   │
│  │   [ 9:00pm ] to [ 7:00am ]         │   │
│  └────────────────────────────────────┘   │
│                                            │
│  Billing                                   │
│  ┌────────────────────────────────────┐   │
│  │ Bill drive time for Emily          │   │
│  │   [ ✗ No ]                         │   │
│  └────────────────────────────────────┘   │
│                                            │
│  Special flags                             │
│  ┌────────────────────────────────────┐   │
│  │ [ ] Home sensitive (retired, etc.) │   │
│  │ [ ] Commercial, recurring          │   │
│  └────────────────────────────────────┘   │
│                                            │
│  🤖 Want to change how I treat Emily?      │
│     Ask me: "Set Emily to get arrival      │
│     texts 15 minutes out instead"          │
└────────────────────────────────────────────┘
```

The last line is critical: the assistant is first-class here. Any of these prefs can be changed conversationally. The UI and the chat are both valid paths to the same underlying data.

### 4. Job detail — job-specific overrides

On each job, an expandable "Tracking & automation" panel:

```
┌────────────────────────────────────────────┐
│  ← Henderson basement drywall              │
│     Emily Henderson · Apr 23               │
│                                            │
│  ...                                       │
│                                            │
│  TRACKING & AUTOMATION ▾                   │
│  ┌────────────────────────────────────┐   │
│  │ Tracking: [ ✓ On ]                 │   │
│  │ Geofence: 75m (from property)      │   │
│  │ Bill drive time: [ ✗ No (warranty)]│   │
│  │ After hours: [ ✗ ]                 │   │
│  │                                    │   │
│  │ Live time tracking                 │   │
│  │ ─ On site: 2h 14m (running)        │   │
│  │ ─ Drive in: 23 min / 14.3 mi       │   │
│  │ ─ Expected: 4h                     │   │
│  │   ━━━━━━━━━░░░░░░░░ 56%            │   │
│  │                                    │   │
│  │ [Override for this job only]       │   │
│  └────────────────────────────────────┘   │
│                                            │
│  🤖 Ask me: "This is warranty work, don't  │
│     bill drive time for it"                │
└────────────────────────────────────────────┘
```

Real-time tracking is visible while the job is running. Progress bar against the estimated duration makes overruns obvious.

### 5. Settings → Automations

The rules manager. Grouped by trigger type so it's easy to scan.

```
┌────────────────────────────────────────────┐
│  ← Automations                             │
│                                            │
│  [+ Create new rule]                       │
│                                            │
│  ON ARRIVAL AT A PROPERTY                  │
│  ┌────────────────────────────────────┐   │
│  │ 📍 Start time on arrival            │   │
│  │    Auto-create time entry when I    │   │
│  │    enter a job property             │   │
│  │    [ ✓ On ]  [Edit]  🔒 Default    │   │
│  ├────────────────────────────────────┤   │
│  │ 💬 Notify customer on arrival       │   │
│  │    Respects quiet hours + prefs     │   │
│  │    [ ✓ On ]  [Edit]  🔒 Default    │   │
│  ├────────────────────────────────────┤   │
│  │ 📂 Pre-arrival briefing             │   │
│  │    5 min out, show property notes   │   │
│  │    [ ✓ On ]  [Edit]  🔒 Default    │   │
│  └────────────────────────────────────┘   │
│                                            │
│  ON LEAVING A JOB SITE                     │
│  ┌────────────────────────────────────┐   │
│  │ 📋 Close out when leaving           │   │
│  │    Prompt: mark complete + invoice  │   │
│  │    [ ✓ On ]  [Edit]  🔒 Default    │   │
│  ├────────────────────────────────────┤   │
│  │ 💰 Remind to invoice after complete │   │
│  │    30 min after leaving             │   │
│  │    [ ✓ On ]  [Edit]  🔒 Default    │   │
│  └────────────────────────────────────┘   │
│                                            │
│  [... more groups collapsed ...]           │
│                                            │
│  🤖 Want to build a new rule?              │
│  "Remind me to send a follow-up text       │
│   3 days after every job completes"        │
└────────────────────────────────────────────┘
```

Toggles are one-tap. Editing opens the plain-English rule editor:

```
┌────────────────────────────────────────────┐
│  ← Edit: Close out when leaving            │
│                                            │
│  WHEN                                      │
│  [ I leave a geofence ▾ ]                  │
│                                            │
│  IF                                        │
│  [ the geofence is a property  ×]          │
│  [ the job is In Progress      ×]          │
│  [ I was there more than 15m   ×]          │
│  [ + Add condition ]                       │
│                                            │
│  THEN                                      │
│  ┌────────────────────────────────────┐   │
│  │ Close my time entry                │   │
│  │  (require me to confirm)         × │   │
│  └────────────────────────────────────┘   │
│  ┌────────────────────────────────────┐   │
│  │ Ask me if I want to:               │   │
│  │  • Mark complete & draft invoice   │   │
│  │  • Mark complete only              │   │
│  │  • Still working                   │   │
│  │  • Snooze 15 min                 × │   │
│  └────────────────────────────────────┘   │
│  [ + Add action ]                          │
│                                            │
│  APPLIES TO                                │
│  [ ○ All customers                   ]     │
│  [ ● Only these customers: [pick]    ]     │
│  [ ○ Except: [pick]                  ]     │
│                                            │
│  COOLDOWN                                  │
│  Don't fire again within [ 1 hour ▾ ]      │
│                                            │
│  [Delete]                  [Save changes]  │
└────────────────────────────────────────────┘
```

For system default rules, "Delete" is replaced with "Reset to default." Users can modify defaults but can't lose the concept — the assistant knows these exist.

## The two-way UX — chat as first-class control

Every setting above is also addressable via the chat assistant:

- *"Disable arrival notifications for Emily"* → `update_customer_location_prefs`
- *"This Williams job is warranty work, don't bill my drive time"* → `update_job_location_prefs`
- *"Don't track me this weekend, I'm going camping"* → `disable_tracking_for_period`
- *"Make the Henderson geofence bigger, the property is large"* → `update_property_geofence`
- *"Create a rule: always remind me to take before-photos when I arrive at a new job"* → `create_automation_rule` with a multi-turn refinement conversation

The assistant shows a summary of what it's about to change and asks for confirmation before executing.

## The prompts surface

When automations trigger `prompt_user` actions, they appear in three places:

1. **Home screen "suggested" cards** — soft, contextual, dismissable
2. **Notification center** — persistent list of pending prompts
3. **Push notification** — for high-priority or time-sensitive prompts

Example prompt flow when you leave a completed job site:

```
┌────────────────────────────────────────────┐
│  Leaving Henderson?                        │
│                                            │
│  You spent 3h 47m on site and used:        │
│  • 4 sheets drywall                        │
│  • 2 rolls mesh tape                       │
│  • 1 gallon joint compound                 │
│                                            │
│  What's next?                              │
│                                            │
│  [Mark complete & draft invoice] ◉         │
│  [Mark complete, I'll invoice later]       │
│  [Still have work to do]                   │
│  [Snooze 15 min]                           │
└────────────────────────────────────────────┘
```

Tap the primary option → invoice opens pre-filled with actual time + materials → one more tap to send. The whole flow from "leave property" to "invoice sent" is 15 seconds.

## Permission & privacy

The app asks for location permission with clear, non-adversarial copy:

```
┌────────────────────────────────────────────┐
│  📍 Location access                        │
│                                            │
│  Premier uses your location to:            │
│                                            │
│  ✓ Auto-track your time on jobs            │
│  ✓ Calculate drive time and mileage        │
│  ✓ Auto-tag photos and notes to properties │
│  ✓ Send timely reminders                   │
│                                            │
│  Premier never:                            │
│  ✗ Shares your location with customers     │
│  ✗ Tracks you outside business hours       │
│    (unless you opt in)                     │
│  ✗ Sells or shares data with anyone        │
│                                            │
│  You can disable tracking anytime from     │
│  Settings, and delete all location history │
│  with one tap.                             │
│                                            │
│  [Allow always]  [Only while using app]    │
│  [Not now]                                 │
└────────────────────────────────────────────┘
```

"Allow always" is required for background geofence detection. "Only while using app" still works — you just have to open the app to log arrivals. Both are valid choices.

## Settings → Privacy & data

```
┌────────────────────────────────────────────┐
│  ← Privacy & data                          │
│                                            │
│  LOCATION TRACKING                         │
│  [ ✓ Enabled ]                             │
│                                            │
│  Business hours                            │
│  Mon-Fri: 7:00am – 6:00pm                  │
│  Sat: (not tracked)                        │
│  Sun: (not tracked)                        │
│  [Edit hours]                              │
│                                            │
│  Data retention                            │
│  Keep raw GPS data for [ 30 days ▾ ]       │
│  (Trips and geofence events kept forever)  │
│                                            │
│  DATA MANAGEMENT                           │
│  [Download my location data]               │
│  [Delete a specific day]                   │
│  [Delete all location history]             │
│                                            │
│  TRANSPARENCY                              │
│  [View my current location data]           │
│  [View all automation triggers]            │
│                                            │
│  🔒 Your recordings and location data      │
│     are stored in your Supabase instance,  │
│     never shared with AI providers beyond  │
│     what's needed for processing.          │
└────────────────────────────────────────────┘
```

## Edge case UX

Each of these shows up as a contextual card when relevant, never as a scolding modal:

- **GPS accuracy poor** → small indicator on tracking status, "GPS signal weak in this area, we may miss arrivals/departures"
- **Unusually long dwell** → after ~20 min over estimate, a gentle card appears: "You've been on site longer than quoted. Update scope?"
- **Implausible trip** → flagged trips in the review list have a ⚠️, tap to investigate or mark as correct
- **Gap in tracking** → "We lost signal between 2:14pm and 2:47pm. Best guess: you were at [nearest fence]. Confirm or edit."
- **Entered geofence briefly** → if below dwell threshold, never counted, never shown (silent filter)
- **Manual override for one-off** → a prominent "Track this trip" button on the lock screen/control center widget for after-hours work

## Summary — what makes this not-a-bolt-on

Every location-aware behavior is:

1. **Visible in context** — you see your live tracking state everywhere it matters (today screen, job detail, property detail), not buried in a tracking tab
2. **Editable where shown** — one tap to fix a wrong auto-classification, no deep navigation
3. **Controllable at the right level** — org default → user pref → customer override → job override, with clear inheritance
4. **Explicable** — every automation fire is logged with its trigger, conditions, and actions; you can see exactly why something happened
5. **Reversible** — nothing is final until you confirm; everything can be undone; all data is deletable
6. **Conversational** — every setting is also a chat action, and every chat action has a UI equivalent
