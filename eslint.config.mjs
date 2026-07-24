import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * ESLint flat config。
 * eslint-config-next v16 已原生提供 flat config 数组，直接展开即可（无需 FlatCompat）。
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      '.data/**',
      'tmp/**',
      'docs/**',
      'src/lib/db/migrations/**',
    ],
  },
]

export default eslintConfig
