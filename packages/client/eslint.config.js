const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const codegen = require('eslint-plugin-codegen')
// import eslint from '@eslint/js'
// import tseslint from 'typescript-eslint'

// console.log({
//   flatConfig: tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended),
// })
// export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended)

console.dir(codegen, {
  depth: 30,
})
exports.default = [
  eslint.configs.recommended,
  codegen.configs.recommended, //
]
// throw 'fsodijf'
