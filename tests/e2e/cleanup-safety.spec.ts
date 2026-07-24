/**
 * Unit-style checks for tests/e2e/utils/cleanup.ts's safety guards. No
 * browser or real Supabase connection needed — these exercise the guard
 * logic in `cleanupTestCustomerByMarker` directly, since it's a service-role
 * (RLS-bypassing) delete and its guards are the only thing standing between
 * this suite and accidentally deleting real customer data.
 */

import { test, expect } from '@playwright/test';
import { cleanupTestCustomerByMarker } from './utils/cleanup';

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test.describe('cleanup safety guards', () => {
  test('refuses to run for a marker without the E2E_TEST_ prefix', async () => {
    await expect(
      cleanupTestCustomerByMarker({ marker: 'NOT_A_TEST_MARKER' })
    ).rejects.toThrow(/E2E_TEST_/);
  });

  test('refuses to run against a non-local Supabase URL without explicit opt-in', async () => {
    const original = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      allowRemote: process.env.E2E_ALLOW_REMOTE_SUPABASE_CLEANUP,
    };

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://some-real-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-guard-test-only';
    delete process.env.E2E_ALLOW_REMOTE_SUPABASE_CLEANUP;

    try {
      await expect(
        cleanupTestCustomerByMarker({ marker: 'E2E_TEST_GUARD_CHECK' })
      ).rejects.toThrow(/non-local|production|shared/i);
    } finally {
      restoreEnvVar('NEXT_PUBLIC_SUPABASE_URL', original.url);
      restoreEnvVar('SUPABASE_SERVICE_ROLE_KEY', original.key);
      restoreEnvVar('E2E_ALLOW_REMOTE_SUPABASE_CLEANUP', original.allowRemote);
    }
  });
});
