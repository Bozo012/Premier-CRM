import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * Premier CRM — Playwright config for the repeatable QA bot suite.
 *
 * Design goals:
 *  - Safe by default: points at a local/dev server, never production.
 *  - Repeatable: HTML report + traces + screenshots + video for every failed run,
 *    so a run can be diffed against the last one without re-running by hand.
 *  - Fast local loop: workers scale with the machine locally, but CI runs serial
 *    to avoid flaky cross-test data collisions until we have per-test data isolation.
 *
 * See tests/e2e/README.md for how to run this suite.
 */

// Load tests/e2e/README.md's documented `.env.test` — @playwright/test does
// NOT auto-load this (unlike some frameworks); without this, every credential-
// gated test silently and "successfully" test.skip()s regardless of whether
// .env.test was ever filled in, which is exactly as convincing as actually
// working. `override: false` keeps real environment variables (e.g. CI
// secrets) taking precedence over the file.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: false });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Fail the build in CI if someone accidentally left `.only` in a spec.
  forbidOnly: IS_CI,

  // Bot specs are written to be independent, but keep retries on to absorb
  // normal dev-server / network flake rather than false-failing a whole bot.
  retries: IS_CI ? 1 : 0,

  workers: IS_CI ? 1 : undefined,

  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  outputDir: 'test-results',

  use: {
    baseURL: BASE_URL,

    // Repeatable diagnostics: only pay the cost when something actually goes wrong.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Used explicitly by the mobile-simplicity bot via test.use({ ...devices[...] })
      // inside the spec, but registered here too so `--project=mobile` works standalone.
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: '**/mobile-simplicity-bot.spec.ts',
    },
  ],

  // Intentionally NOT using webServer: auto-start here, because Premier CRM needs
  // real Supabase env vars wired up. Local/dev/test data setup is documented in
  // tests/e2e/README.md — the person running the suite starts `pnpm dev` themselves
  // so they stay in control of which environment the bots point at.
});
