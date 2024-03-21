module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    rules: {
      'no-coonsole': 'off',
    },
  },
]
