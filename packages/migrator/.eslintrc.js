// eslint-disable-next-line mmkal/import/no-extraneous-dependencies
const recommended = require('eslint-plugin-mmkal').getRecommended()

module.exports = {
  ...recommended,
  plugins: [...recommended.plugins, 'codegen', '@stylistic'],
  overrides: [
    ...recommended.overrides,
    {
      files: ['*.md'],
      rules: {
        'mmkal/unicorn/filename-case': 'off',
        'mmkal/prettier/prettier': 'off',
      },
    },
    {
      files: ['test/**/*'],
      rules: {
        'mmkal/import/no-extraneous-dependencies': 'off',
      },
    },
  ],
  rules: {
    '@stylistic/no-mixed-operators': 'warn',
    'mmkal/@typescript-eslint/consistent-type-imports': 'off',
    'mmkal/@typescript-eslint/parameter-properties': 'off',
    'mmkal/@rushstack/packlets/mechanics': 'off',
    'mmkal/@typescript-eslint/no-explicit-any': 'off',
    'mmkal/@typescript-eslint/no-unsafe-assignment': 'off',
    'mmkal/@typescript-eslint/no-unsafe-return': 'off',
    'mmkal/@rushstack/hoist-jest-mock': 'off',
    'mmkal/codegen/codegen': 'off',
    'codegen/codegen': 'warn',
    'mmkal/unicorn/expiring-todo-comments': 'off',
    'mmkal/unicorn/consistent-destructuring': 'off',
  },
}
