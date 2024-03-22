module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    rules: {
      'no-redeclare': 'off', // mmkal: typescript has valid redeclare use cases
    },
  },
]
