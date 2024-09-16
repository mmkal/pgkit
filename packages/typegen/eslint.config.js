module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
]
