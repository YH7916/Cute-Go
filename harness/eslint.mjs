import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import boundaries from 'eslint-plugin-boundaries';
import { architecture } from './architecture.mjs';

const { sourcePolicy, qualityPolicy } = architecture;
const dependencyRules = architecture.modules.map(module => ({
  from: { type: module.id }, allow: { to: { type: module.allow } },
}));
for (const exception of architecture.dependencyExceptions) {
  dependencyRules.push({
    from: { type: exception.from, ...(exception.fromFiles ? { path: exception.fromFiles } : {}) },
    allow: {
      to: { type: exception.to, ...(exception.toFiles ? { path: exception.toFiles } : {}) },
      ...(exception.kind ? { dependency: { kind: exception.kind } } : {}),
    },
  });
}

function dynamicPackageSelector(packages) {
  const roots = [...new Set(packages.map(name => name.replace(/\/\*\*$/, '')))];
  const escaped = roots.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `ImportExpression[source.value=/^(${escaped.join('|')})(\\u002F|$)/]`;
}

export default [
  { ignores: sourcePolicy.ignores },
  {
    files: sourcePolicy.files,
    linterOptions: {
      noInlineConfig: qualityPolicy.noInlineConfig,
      reportUnusedDisableDirectives: qualityPolicy.unusedDisableDirectives,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, import: importPlugin, boundaries },
    settings: {
      // A resolver alone does not make import/no-cycle traverse TypeScript.
      'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] },
      'import/extensions': ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
      'import/resolver': { typescript: { alwaysTryTypes: true }, node: true },
      'boundaries/elements': architecture.modules.map(module => ({ type: module.id, mode: 'full', pattern: module.patterns })),
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      'max-lines': ['error', { max: sourcePolicy.maxEffectiveLines,
        skipBlankLines: sourcePolicy.skipBlankLines, skipComments: sourcePolicy.skipComments }],
      'import/no-cycle': 'error',
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': ['error', { default: 'disallow', rules: dependencyRules }],
    },
  },
  ...architecture.packageRestrictions.map(restriction => ({
    files: restriction.files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: restriction.packages, message: restriction.message }] }],
      'no-restricted-modules': ['error', { patterns: restriction.packages }],
      'no-restricted-syntax': ['error', { selector: dynamicPackageSelector(restriction.packages), message: restriction.message }],
    },
  })),
  ...architecture.propertyRestrictions.map(restriction => ({
    files: restriction.files,
    ignores: restriction.ignores,
    rules: { 'no-restricted-properties': ['error', { property: restriction.property, message: restriction.message }] },
  })),
];
