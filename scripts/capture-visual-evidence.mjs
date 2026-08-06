// One-off script (not part of the committed test suite) to capture
// authenticated screenshots of the Base44-exact Forge shell for PR #125's
// visual-review section. Not a Playwright *test* — no assertions, just
// screenshots. Requires the dev server already running with .env.test's
// premier-crm-e2e credentials (see tests/e2e/README.md), passed via
// BASE_URL and TEST_ADMIN_EMAIL/PASSWORD env vars.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const OUT_DIR = 'visual-evidence';

if (!EMAIL || !PASSWORD) {
  console.error('TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-portrait-768x1024', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@company.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today', { timeout: 15000 });
}

async function setTheme(page, mode) {
  // ThemeControl lives in the staff menu on the new shell; on /today
  // (legacy shell) it's reached the same way via the account menu.
  // Simplest reliable path: localStorage key the existing ThemeProvider
  // reads, then reload — avoids depending on exactly which menu surface
  // is open across two different shells.
  await page.evaluate((m) => localStorage.setItem('forge-appearance', m), mode);
  await page.reload();
}

async function run() {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await login(page);

    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode);

      // Customers list (new ForgeShell)
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${OUT_DIR}/customers-list_${vp.name}_${mode}.png`, fullPage: true });

      // Desktop sidebar / mobile nav are visible on the same screenshot at
      // desktop/phone widths respectively — captured above, no separate
      // shot needed except a focused crop for the record.
      if (vp.width >= 1024) {
        const sidebar = page.locator('nav').first();
        if (await sidebar.count()) {
          await sidebar.screenshot({ path: `${OUT_DIR}/desktop-sidebar_${vp.name}_${mode}.png` }).catch(() => {});
        }
      }

      // Staff/account menu — open it, screenshot, close.
      const staffMenuTrigger = page.getByRole('button', { name: /account|profile|staff menu/i }).first();
      if (await staffMenuTrigger.count()) {
        await staffMenuTrigger.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT_DIR}/staff-menu_${vp.name}_${mode}.png`, fullPage: true });
        await page.keyboard.press('Escape');
      }

      // Customer detail — navigate to the first row/card if one exists.
      await page.goto(`${BASE_URL}/customers`);
      await page.waitForLoadState('networkidle');
      // Rows are onClick-driven <tr>/mobile-card elements (ported faithfully
      // from Base44's CustomersList, which does the same), not real <a
      // href> anchors — the desktop table is `hidden lg:block` and the
      // mobile card grid is `lg:hidden`, so exactly one is actually visible
      // per viewport; try both, whichever is clickable wins.
      let opened = false;
      // Tailwind's colon-bearing responsive class names don't survive as a
      // literal CSS selector reliably across engines — instead of matching
      // structure, click the first visible row/card's own visible text
      // (any element's click event bubbles up to the ported component's
      // onClick handler on its <tr>/<div> ancestor either way).
      const desktopRow = page.locator('tbody tr').first();
      // Colon-bearing Tailwind class names (lg:hidden) don't reliably work
      // as literal CSS selectors across engines — match the grid container's
      // direct children instead, which avoids the colon entirely.
      const mobileCard = page.locator('div.grid.gap-3 > div').first();
      const clickTarget = (await desktopRow.isVisible().catch(() => false)) ? desktopRow : mobileCard;
      if (await clickTarget.count()) {
        try {
          await clickTarget.click({ timeout: 3000 });
          await page.waitForURL(/\/customers\/[0-9a-f-]{8,}/i, { timeout: 5000 });
          opened = true;
        } catch {
          // click/navigation didn't happen — leave opened=false, handled below
        }
      }
      if (opened) {
        // The RSC Suspense boundary briefly shows loading.tsx's fallback
        // after client-side navigation; a fixed settle delay (confirmed
        // sufficient via a manual probe — real content renders well under
        // 2s) is simpler and more reliable here than chasing the loading
        // text's exact lifecycle.
        await page.waitForTimeout(2500);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `${OUT_DIR}/customer-detail_${vp.name}_${mode}.png`, fullPage: true });
      } else {
        console.warn(`No customers found to open a detail view at ${vp.name}/${mode} — list may be empty in this org.`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('Done. Screenshots in', OUT_DIR);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
