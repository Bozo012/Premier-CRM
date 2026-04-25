import nextPlugin from '@next/eslint-plugin-next';
import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/sw.js',
      'public/workbox-*.js',
      'next-env.d.ts',
    ],
  },
];
