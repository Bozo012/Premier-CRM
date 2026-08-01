import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the @premier/* and apps/web's @/* path aliases from tsconfig.json.
    alias: {
      '@premier/shared': path.resolve(__dirname, 'packages/shared/index.ts'),
      '@premier/db': path.resolve(__dirname, 'packages/db/index.ts'),
      '@premier/ai': path.resolve(__dirname, 'packages/ai/index.ts'),
      '@premier/automation': path.resolve(__dirname, 'packages/automation/engine.ts'),
      '@': path.resolve(__dirname, 'apps/web'),
    },
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
