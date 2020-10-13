module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.d.ts', '!**/generated/**'],
}
