import js from '@eslint/js'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['out/**', 'coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['tests/**/*.mjs'], languageOptions: { globals: globals.node } },
)
