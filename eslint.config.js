const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // catch real bugs
      'eqeqeq':            ['error', 'always', { null: 'ignore' }],
      'no-var':            'error',
      'no-unused-vars':    ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef':          'error',

      // async safety
      'no-return-await':   'error',
      'require-await':     'error',

      // style — relaxed for a backend
      'prefer-const':      'warn',
      'no-console':        'off',
    },
  },
];
