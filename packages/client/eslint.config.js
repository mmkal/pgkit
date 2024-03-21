module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
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
