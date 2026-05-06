import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'android/**', '*.config.js', '*.config.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      boundaries,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
        node: true,
      },
      'boundaries/elements': [
        { type: 'core', pattern: 'core/**' },
        { type: 'domains', pattern: 'domains/**' },
        { type: 'ui', pattern: 'ui/**' },
        { type: 'worker', pattern: 'worker/**' },
        { type: 'utils', pattern: 'utils/**' },
        { type: 'components', pattern: 'components/**' },
        { type: 'hooks', pattern: 'hooks/**' },
        { type: 'app', pattern: 'App.tsx' },
      ],
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Import cycles — 重构期间最重要的规则
      'import/no-cycle': ['error', { maxDepth: 3 }],

      // Boundaries — 层级依赖规则（重构完成后逐步收紧）
      'boundaries/element-types': [
        'warn',
        {
          default: 'allow',
          rules: [
            // core 不能依赖 domains/ui/app
            { from: 'core', disallow: ['domains', 'ui', 'app'] },
            // domains 不能依赖 ui/app
            { from: 'domains', disallow: ['ui', 'app'] },
          ],
        },
      ],
    },
  },
];
