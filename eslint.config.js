import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Minimal lint gate for operational privacy:
 * no console.* anywhere in extension source.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      'dist/**',
      'coverage/**',
      'web-ext-artifacts/**',
      '*.zip',
    ],
  },
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'no-console': 'error',
      // Keep TypeScript rules light — privacy gate, not style bible.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', 'wxt.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Tooling / config may log; still forbid console in src/ via default.
      'no-console': 'off',
    },
  }
);
