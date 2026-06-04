// Flat ESLint config (ESLint 9). Tuned to catch real bugs without drowning the
// existing codebase in style noise: rules-of-hooks is an error (it catches the
// kind of bug nothing else would), most else is a warning.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'android/**', 'node_modules/**', 'public/**', '*.config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The classic, high-signal hooks pair. (The plugin's newer purity/
      // set-state-in-effect rules are performance opinions, not bugs, and the
      // codebase uses those valid patterns widely — so we don't enable them.)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-binary-expression': 'warn',
      // New ESLint-recommended rule with false positives on assign-then-
      // conditionally-reassign and closure captures — keep as signal, not a fail.
      'no-useless-assignment': 'warn',
    },
  },
];
