// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/content-dist/**',
      'apps/desktop/src-tauri/target/**',
      'apps/desktop/src-tauri/gen/**',
      '**/*.gen.ts',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // React app
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    ...reactRefresh.configs.vite,
  },
  {
    // Node scripts and config files
    files: ['scripts/**/*.{js,mjs}', '**/*.config.{js,mjs,ts}', 'packages/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
