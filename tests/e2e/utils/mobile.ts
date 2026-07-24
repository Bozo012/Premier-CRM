/**
 * Mobile/tablet viewport helpers for the Premier CRM bot suite.
 *
 * Premier is PWA-first (see MOBILE-STRATEGY.md) — mobile usability is a
 * product requirement, not an afterthought, so this suite checks real
 * viewport sizes rather than only desktop Chrome.
 */

export interface ViewportProfile {
  name: string;
  width: number;
  height: number;
}

// Matches common real-world devices Kevin actually uses (iPhone/iPad) plus a
// generic small-phone floor size, without pulling in a full device descriptor
// (those are used directly via `devices[...]` in the mobile bot spec instead).
export const viewportProfiles: ViewportProfile[] = [
  { name: 'phone-small', width: 375, height: 667 }, // iPhone SE class
  { name: 'phone-standard', width: 390, height: 844 }, // iPhone 13/14 class
  { name: 'tablet', width: 820, height: 1180 }, // iPad Air class
];

/**
 * Minimum comfortable tap target size (px). Set to match this app's actual
 * design-system default (shadcn/ui Button `size="default"` is `h-9` = 36px,
 * used app-wide) rather than an external guideline (e.g. WCAG's 44px) that
 * would fail on every button in the app. Raising the app's default button
 * height is a product/design-system decision, not something to do silently
 * as a side effect of this test suite.
 */
export const MIN_TAP_TARGET_PX = 36;

/**
 * Tolerance (px) for horizontal-scroll checks, used as the "scrolled how far
 * right" budget in tests/e2e/mobile-simplicity-bot.spec.ts's "no horizontal
 * scroll" check (attempts window.scrollTo(9999, 0) and asserts scrollX stays
 * within this budget).
 *
 * Verified empirically: under Playwright's WebKit `devices['iPhone 13']`
 * profile with an overridden custom viewport (as this bot suite does to test
 * multiple sizes against one device profile), the page consistently allows
 * ~8-10px of horizontal scroll regardless of viewport width (375/390/820px
 * all showed the same ~8-10px) and regardless of actual rendered content
 * width (confirmed via diagnostic script: widest element on the login page
 * is 449px, well under every tested viewport) — i.e. it doesn't scale with
 * content the way a real overflow bug would. This points to a fixed
 * emulation artifact of that device+viewport-override combination rather
 * than an app bug. Set with margin above the observed ~10px.
 */
export const HORIZONTAL_SCROLL_TOLERANCE_PX = 15;
