module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    rules: {
      'no-console': 'off',
      'unicorn/prefer-ternary': 'off',
    },
  },
]
