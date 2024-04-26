module.exports = [
  ...require('eslint-plugin-mmkal').recommendedFlatConfigs,
  {plugins: {tailwindcss: require('eslint-plugin-tailwindcss')}},
  {languageOptions: {globals: {React: false, JSX: false}}},
  {
    rules: {
      'no-console': 'off',
      'unicorn/prefer-ternary': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      'tailwindcss/no-custom-classname': [
        'warn',
        {
          whitelist: [/DISABLED.*/.source],
        },
      ],
    },
  },
]
