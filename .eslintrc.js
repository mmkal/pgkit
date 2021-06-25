module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {ecmaVersion: 2018, sourceType: 'module'},
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier', 'codegen'],
  rules: {
    'prettier/prettier': ['warn', require('./.prettierrc')],
    '@typescript-eslint/prefer-namespace-keyword': 'warn',
    '@typescript-eslint/no-namespace': ['warn', {allowDeclarations: true}],
    'codegen/codegen': 'warn',
  },
  overrides: [
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
