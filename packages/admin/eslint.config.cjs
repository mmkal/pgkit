module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {languageOptions: {globals: {React: false, JSX: false}}},
  {
    rules: {
      'no-console': 'off',
      'unicorn/prefer-ternary': 'off',
    },
  },
]
