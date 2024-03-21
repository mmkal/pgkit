module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    files: ['*.md/*'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]
