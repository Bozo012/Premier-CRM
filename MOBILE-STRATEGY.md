# Mobile Strategy

How Premier works on iPhone and iPad without an Apple Developer account.

## The plan in one sentence

**Build the entire system as a Next.js Progressive Web App. Defer native iOS development indefinitely unless background location tracking proves to be a critical missing feature, at which point pay $99/year for an Apple Developer account and ship a thin companion app via TestFlight.**

## Why PWA-first

Kevin uses iPhone and iPad as his primary mobile devices. He has no Apple Developer account ($99/year). For 95% of what Premier does on mobile, a well-built PWA is indistinguishable from a native app. Starting with PWA means:

- $0 to ship
- No App Store review process
- No expiration cycles (TestFlight builds expire every 90 days)
- Single codebase for web, mobile web, iPad
- Iteration speed: changes deploy instantly via Vercel
- All features available on day 1, no "waiting for native"

## What PWAs can do on iOS in 2026

Confirmed working:
- Install to home screen with custom icon and splash screen
- Launch fullscreen (no Safari chrome)
- Camera capture (photo + video)
- Microphone (MediaRecorder API for audio recording)
- Push notifications (since iOS 16.4+)
- Offline mode (service workers cache app shell + critical data)
- File uploads
- Foreground geolocation
- Touch ID / Face ID via WebAuthn
- IndexedDB for offline data persistence

## What PWAs cannot do on iOS

The hard limits:
- **Background location tracking** ← the big one
- Native HealthKit / Contacts / Calendar APIs
- Siri Shortcuts integration
- Widgets
- AirDrop
- Background audio recording when app is closed

## How we handle the background location gap

Three strategies, in order of cost:

### Strategy 1 (default): Foreground geofences only

Geofence automations work when the app is open or in the foreground. Closing the app stops tracking. Workflow:

- Kevin opens the app at the start of his workday
- It stays in the foreground (or background-but-recently-active) while he works
- Automations fire normally for the day
- He closes it at end of day

This handles 80% of the value. Time entries auto-start/stop, drive time tracks, geofence-based vault enrichment works — all when the app is in active use.

### Strategy 2 (if needed): Third-party mileage tracking integration

If Strategy 1 isn't enough, integrate a service whose dedicated app already does background tracking:
- **Hurdlr** — has API, $10-15/mo
- **MileIQ** — has CSV export, ~$60/year
- **Everlance** — has API
- **TripLog** — has API

Their app tracks in background. We import their data nightly via API or CSV, attribute trips to jobs/customers via our geofence + customer location matching.

Cost: $60-180/year. Dev cost: 1-2 days for integration.

### Strategy 3 (if it really matters): Native companion app via TestFlight

If background geofences become a critical missing feature after 3-6 months of real use:

1. Pay Apple $99/year for personal developer account
2. Build minimal Expo app — only does background location tracking
3. Upload to TestFlight via Expo EAS Build (free tier sufficient)
4. Install on Kevin's devices via TestFlight (no App Store listing needed)
5. App uploads location events to Supabase, that's it

The companion app does NOT replace the PWA. The PWA remains the primary UI. The native app is a 200-line tracker that runs in the background and feeds the same backend.

Cost: $99/year + ~3-5 days of dev work. Lifetime install via TestFlight (rebuild every 90 days, ~10 min).

## PWA implementation requirements

For the PWA to feel native, these are non-negotiable:

### Manifest

```json
{
  "name": "Premier",
  "short_name": "Premier",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Service worker

- Precache app shell + critical assets
- Runtime cache for API responses with stale-while-revalidate
- Background sync for queued mutations when offline
- Push notification handling

Use Workbox via `next-pwa` plugin or implement directly.

### Offline support

The app must work without a network connection for these flows:
- Viewing customer/property/job detail (data cached on previous load)
- Recording audio (queued for upload when network returns)
- Capturing photos (queued for upload)
- Drafting notes (saved locally, synced)
- Viewing today's schedule (cached at start of day)

Quote/invoice creation, payment processing, AI chat: online-only is acceptable.

### Install prompts

- Show "Add to Home Screen" prompt on second visit if not installed
- Custom install UI (Apple doesn't support `beforeinstallprompt`, requires manual instructions for iOS users)
- Splash screen images for all iOS device sizes (32 different sizes — generate via PWA Asset Generator)

### Notification permissions

- Request push notification permission contextually, not on first load
- Permission for: arrival reminders, automation prompts, daily briefing
- Always provide opt-out per-category in settings

### Performance for mobile

- Bundle size budget: <200KB initial JS gzipped
- Lazy-load heavy features (chat, map editor) via dynamic imports
- Image optimization via Next.js Image component
- Avoid jank: skeleton screens for slow data, optimistic UI for fast feedback

## iPad-specific considerations

iPad (especially with keyboard) is Kevin's primary "office" device. Treat it as a full desktop experience:

- Responsive layouts that take advantage of tablet width
- Keyboard shortcuts for power users
- Multi-column layouts where appropriate (master/detail patterns)
- Hover states acceptable since iPad supports trackpad/cursor
- Drag and drop where it makes sense

## iPhone-specific considerations

iPhone is the "in-the-field" device. Optimize ruthlessly for:

- One-handed use
- Glanceable info
- Fast capture (mic, camera) — should be 1-tap from home screen
- Network-tolerant (works on spotty cellular)
- Battery-conscious (don't poll aggressively, use realtime subscriptions)

## When (if ever) to revisit

We revisit the native question if:
- Kevin starts losing data because the app wasn't open during a geofence event
- Background tracking becomes the #1 friction point in user testing
- We expand to a team with field workers (the PWA-only model scales fine for one person; less sure for 5+)
- Apple introduces meaningful PWA limitations (unlikely but possible)

Until then, every additional feature is built as PWA-compatible.

## Development workflow on mobile

To test on actual devices during development:

1. Run dev server bound to local network: `pnpm dev --hostname 0.0.0.0`
2. Find your machine's local IP
3. On the iPhone/iPad, open Safari to `http://[your-ip]:3000`
4. Add to home screen for PWA testing
5. For HTTPS-required features (camera, mic, push), use ngrok or Tailscale Funnel for tunneling

For production-like testing, deploy to a Vercel preview branch and access via the preview URL.
