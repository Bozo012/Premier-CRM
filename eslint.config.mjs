// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore patterns — applied globally before all other configs
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/*.config.mjs',
      '**/*.config.js',
      'packages/db/types.ts', // generated file
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (no type-checking; those are added per-package when needed)
  ...tseslint.configs.recommended,

  // Project-wide rule overrides
  {
    rules: {
      // CONVENTIONS.md: no `any` without an explicit comment explaining why
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars: warn, but allow _-prefixed names for intentional ignores
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Enforce `import type` for type-only imports (keeps runtime bundle clean)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Allow empty interfaces — common for extending base types
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
