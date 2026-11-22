import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Electron main process + preload (CommonJS).
  {
    files: ['main.js', 'preload.js', 'image-types.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  // Renderer pages (ES modules in the browser).
  {
    files: ['renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  // Node scripts and tests.
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
];
