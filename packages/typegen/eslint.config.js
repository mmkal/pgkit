module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unbound-method': 'off', // mmkal - leave me alone
    },
  },
]
