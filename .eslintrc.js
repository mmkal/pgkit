module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {ecmaVersion: 2018, sourceType: 'module'},
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'prettier',
    'codegen'
  ],
  rules: {
    'prettier/prettier': ['warn', require('./.prettierrc.json')],
    'codegen/codegen': ['error', {presets: {shit: () => '123'}}],
  },
}
