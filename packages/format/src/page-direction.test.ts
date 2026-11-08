import { expect, test } from 'bun:test'
import { pageDirection } from './page-direction.ts'

test('resolves a page direction from its authored root, declaration, language, then visible text', () => {
  expect(pageDirection({ dir: 'ltr', lang: 'en', html: '<html dir="rtl"><body>Hello</body></html>' })).toBe('rtl')
  expect(pageDirection({ dir: 'ltr', lang: 'he', html: '<p>שלום</p>' })).toBe('ltr')
  expect(pageDirection({ lang: 'he', html: '<p>Hello</p>' })).toBe('rtl')
  expect(pageDirection({ html: '<style>p{color:red}</style><p>שלום</p>' })).toBe('rtl')
  expect(pageDirection({ html: '<p>Hello</p>' })).toBe('ltr')
})
