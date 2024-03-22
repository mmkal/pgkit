module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {
    files: ['**/*.md/*commented-out.js'],
    rules: {
      'prettier/processed': 'off', // mmkal filter out rules other than codegen on the codegen-preprocessed file
    },
  },
]
