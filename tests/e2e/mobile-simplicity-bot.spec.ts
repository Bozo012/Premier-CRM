/**
 * mobile-simplicity-bot: Premier is PWA-first (MOBILE-STRATEGY.md) and is
 * meant to be genuinely usable one-handed on a phone in the field. This bot
 * runs core screens at phone and tablet viewport sizes and checks for basic
 * mobile usability, not just "does it render."
 *
 * Scope for this pass: viewport smoke coverage of the login page (reachable
 * pre-auth, so no credentials required) plus a scaffold for authenticated
 * mobile checks once customer-crud-bot exists to produce known test data.
 */

import { test, expect } from '@playwright/test';
import { login, routes } from './utils/selectors';
import {
  viewportProfiles,
  MIN_TAP_TARGET_PX,
  HORIZONTAL_SCROLL_TOLERANCE_PX,
} from './utils/mobile';

for (const profile of viewportProfiles) {
  test.describe(`mobile simplicity bot — ${profile.name} (${profile.width}x${profile.height})`, () => {
    test.use({ viewport: { width: profile.width, height: profile.height } });

    test('login page renders and the sign-in button is a comfortable tap target', async ({
      page,
    }) => {
      await page.goto(routes.login);

      await expect(login.heading(page)).toBeVisible();
      await expect(login.emailInput(page)).toBeVisible();
      await expect(login.passwordInput(page)).toBeVisible();

      const button = login.submitButton(page);
      await expect(button).toBeVisible();

      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
      }
    });

    test('login page has no horizontal scroll at this viewport', async ({ page }) => {
      await page.goto(routes.login);

      // Behavioral check rather than a scrollWidth/clientWidth comparison:
      // under WebKit mobile-device emulation with an overridden viewport (as
      // used here), those metrics disagree with each other and with the real
      // viewport by several px even when no content actually overflows — a
      // measurement artifact of that emulation mode, not a real bug. Actually
      // attempting to scroll right and checking the page didn't move is what
      // "no horizontal scroll" means to a real user, and isn't affected by
      // that artifact.
      const scrollXAfterAttempt = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        return window.scrollX;
      });
      expect(scrollXAfterAttempt).toBeLessThanOrEqual(HORIZONTAL_SCROLL_TOLERANCE_PX);
    });
  });
}

// Full real-device emulation (user agent, touch, pixel ratio, viewport) is
// handled by running this file under the `mobile` Playwright project (see
// playwright.config.ts, which maps devices['iPhone 13'] to this spec file)
// rather than overriding it per-test here — `test.use()` with a full device
// object isn't allowed inside a nested describe, only at project/file scope.
// Run with: pnpm exec playwright test mobile-simplicity-bot --project=mobile

test.describe('mobile simplicity bot — authenticated screens (TODO)', () => {
  test.skip('bottom nav is usable and all items are tappable on phone', async () => {
    // TODO: loginAsAdmin, assert AppBottomNav items each meet MIN_TAP_TARGET_PX
    // and don't overlap at phone width.
  });

  test.skip('today screen is legible without zoom on phone', async () => {
    // TODO: implement once /today content is stable enough to assert against.
  });

  test.skip('customer command center is usable on tablet', async () => {
    // TODO: depends on customer-command-center-bot fixtures.
  });
});
