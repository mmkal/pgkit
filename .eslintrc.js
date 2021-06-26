module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {ecmaVersion: 2018, sourceType: 'module'},
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier', 'codegen', 'import'],
  extends: ['plugin:import/recommended', 'plugin:import/typescript'],
  ignorePatterns: ['**/fixtures/**', '**/dist/**'],
  rules: {
    'prettier/prettier': ['warn', require('./.prettierrc')],
    '@typescript-eslint/prefer-namespace-keyword': 'warn',
    '@typescript-eslint/no-namespace': ['warn', {allowDeclarations: true}],
    'codegen/codegen': 'warn',
    'import/no-extraneous-dependencies': 'error',
    // seems to do the wrong thing with find-up
    'import/namespace': 'off',
  },
  overrides: [
    {
      files: ['*/*/test/**', '**/*.test.ts'],
      rules: {
        // allow using root package dependencies in tests
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['**/*.md', '*.md'],
      rules: {
        'prettier/prettier': 'off',
        'no-trailing-spaces': 'off',
        'no-multiple-empty-lines': 'off',
        'unicorn/filename-case': 'off',
      },
    },
  ],
}
