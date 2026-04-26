import { createBrowserClient } from '@premier/db';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
  if (!browserClient) {
    browserClient = createBrowserClient();
  }

  return browserClient;
}
