// Minimal ESLint flat config (optional tooling: `npx eslint src tools tests`).
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
        localStorage: 'readonly', indexedDB: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', console: 'readonly', confirm: 'readonly', ImageData: 'readonly',
        btoa: 'readonly', atob: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', Node: 'readonly', globalThis: 'readonly', self: 'readonly', caches: 'readonly',
        fetch: 'readonly', Response: 'readonly', process: 'readonly', Buffer: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
    },
  },
];
