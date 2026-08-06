import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/generated', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // The privacy promise, enforced by the linter as well as by tests.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'This app makes no network requests. See PLAN §10.' },
        { name: 'XMLHttpRequest', message: 'This app makes no network requests. See PLAN §10.' },
        { name: 'WebSocket', message: 'This app makes no network requests. See PLAN §10.' },
        { name: 'EventSource', message: 'This app makes no network requests. See PLAN §10.' },
      ],
    },
  },
);
