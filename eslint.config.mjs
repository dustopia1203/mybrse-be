import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      '.aws-sam/**',
      '.husky/_/**',
      '.agents/**',
      '.worktrees/**',
      'docs/**',
    ],
  },
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vitest*.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Fake ports preserve asynchronous interfaces without performing I/O.
      '@typescript-eslint/require-await': 'off',
      // Adapter tests exercise normalization of arbitrary provider failures.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allowThrowingUnknown: true },
      ],
    },
  },
  prettier,
)
