module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {ignores: ['**/ignoreme/**']},
  {
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  {
    files: ['*.md/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
]
