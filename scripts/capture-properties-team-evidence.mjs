// One-off script (not part of the committed test suite) to capture
// authenticated screenshots of Properties + Team for PR review. Viewport
// crops (not fullPage) to keep files small enough to share directly.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL;
const PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const OUT_DIR = 'visual-evidence-properties-team';

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
    const target = page.getByRole('button', { name: /^Open (property|team member)/ }).first();
    if (await target.count()) {
      await target.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
  await ctx.close();
}

await shot({ width: 1440, height: 900 }, 'light', '/properties', 'properties-list_desktop_light');
await shot({ width: 1440, height: 900 }, 'dark', '/properties', 'properties-list_desktop_dark');
await shot({ width: 390, height: 844 }, 'light', '/properties', 'properties-list_mobile_light');
await shot({ width: 1440, height: 900 }, 'light', '/properties', 'properties-detail_desktop_light', { openFirstRow: true });
await shot({ width: 1440, height: 900 }, 'dark', '/properties', 'properties-detail_desktop_dark', { openFirstRow: true });
await shot({ width: 390, height: 844 }, 'light', '/properties', 'properties-detail_mobile_light', { openFirstRow: true });

await shot({ width: 1440, height: 900 }, 'light', '/team', 'team-list_desktop_light');
await shot({ width: 1440, height: 900 }, 'dark', '/team', 'team-list_desktop_dark');
await shot({ width: 390, height: 844 }, 'light', '/team', 'team-list_mobile_light');
await shot({ width: 1440, height: 900 }, 'light', '/team', 'team-detail_desktop_light', { openFirstRow: true });
await shot({ width: 1440, height: 900 }, 'dark', '/team', 'team-detail_desktop_dark', { openFirstRow: true });
await shot({ width: 390, height: 844 }, 'light', '/team', 'team-detail_mobile_light', { openFirstRow: true });

await browser.close();
console.log('Done.', OUT_DIR);
