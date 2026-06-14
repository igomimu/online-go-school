import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // テスト・E2E・開発ツーリング・Deno Edge Function は信頼境界/モックコード。
    // 型厳格ルール（any/Function型/空ブロック）はここでは緩和する。
    // unused-vars と react-hooks 系は緩めない（本番同様の品質を保つ）。
    files: [
      '**/*.test.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'scripts/**/*.{ts,tsx}',
      'supabase/functions/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-empty': 'off',
    },
  },
])
