// One-off script (not part of the committed test suite) to capture
// authenticated screenshots of Requests + Site Visits + Inspection for PR
// review. Viewport crops (not fullPage) to keep files small enough to share
// directly. Follows the capture-properties-team-evidence.mjs pattern.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const OUT_DIR = 'visual-evidence-requests-site-visits';

if (!EMAIL || !PASSWORD) {
  console.error('TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set.');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@company.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/today', { timeout: 15000 });
}

async function setTheme(page, mode) {
  await page.evaluate((m) => localStorage.setItem('forge-appearance', m), mode);
  await page.reload();
}

const browser = await chromium.launch();

async function shot(vp, mode, route, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await login(page);
  await setTheme(page, mode);
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  if (opts.openFirstRow) {
    const target = page.locator(`a[href^="${opts.detailPrefix}/"]:not([href$="/new"])`).first();
    if (await target.count()) {
      const href = await target.getAttribute('href');
      await page.goto(`${BASE_URL}${href}`);
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  }
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
  await ctx.close();
  return page;
}

await shot({ width: 1440, height: 900 }, 'light', '/requests', 'requests-list_desktop_light');
await shot({ width: 390, height: 844 }, 'light', '/requests', 'requests-list_mobile_light');
await shot({ width: 1440, height: 900 }, 'light', '/requests', 'requests-detail_desktop_light', {
  openFirstRow: true,
  detailPrefix: '/requests',
});

await shot({ width: 1440, height: 900 }, 'light', '/site-visits', 'site-visits-list_desktop_light');
await shot({ width: 390, height: 844 }, 'light', '/site-visits', 'site-visits-list_mobile_light');
await shot({ width: 1440, height: 900 }, 'light', '/site-visits', 'site-visits-detail_desktop_light', {
  openFirstRow: true,
  detailPrefix: '/site-visits',
});

// Inspection wizard: find an in_progress visit via the list, open its
// inspection page, and walk through all 5 steps.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE_URL}/site-visits`);
  await page.waitForLoadState('networkidle');

  const firstVisit = page.locator('a[href^="/site-visits/"]:not([href$="/new"])').first();
  if (await firstVisit.count()) {
    const href = await firstVisit.getAttribute('href');

    // Schedule the visit through the real ScheduleForm (server action) so
    // it's eligible for Start inspection — same path a real user takes.
    await page.goto(`${BASE_URL}${href}`);
    await page.waitForLoadState('networkidle');
    const startInput = page.locator('#start');
    if (await startInput.count()) {
      const start = new Date(Date.now() + 3600_000);
      const end = new Date(Date.now() + 7200_000);
      const fmt = (d) => d.toISOString().slice(0, 16);
      await startInput.fill(fmt(start));
      await page.locator('#end').fill(fmt(end));
      await page.getByRole('button', { name: /^Confirm$/ }).click();
      await page.waitForTimeout(1500);
    }

    await page.goto(`${BASE_URL}${href}/inspection`);
    await page.waitForLoadState('networkidle');

    const startBtn = page.getByRole('button', { name: /^Start inspection$/i });
    if (await startBtn.count()) {
      await startBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    const steps = ['Arrival', 'Findings', 'Measurements & Photos', 'Recommendations', 'Review'];
    for (const [i, step] of steps.entries()) {
      await page.screenshot({ path: `${OUT_DIR}/inspection-step${i + 1}-${step.toLowerCase().replace(/[^a-z]+/g, '-')}_desktop_light.png`, fullPage: false });
      const continueBtn = page.getByRole('button', { name: /^Continue$/ });
      if (await continueBtn.count()) {
        await continueBtn.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  } else {
    console.log('No site visits available — skipping inspection wizard capture.');
  }
  await ctx.close();
}

await browser.close();
console.log('Done.', OUT_DIR);
