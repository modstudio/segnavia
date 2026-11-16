import { expect, test } from 'bun:test'
import { firstStrongDirection, htmlTextSample, resolveDirection } from './direction.ts'

test('resolves an HTML fragment from visible Hebrew text rather than markup', () => {
  const html = '<!-- English --><script>English</script><style>.English{}</style><template>English</template><p>שלום עולם</p>'
  expect(resolveDirection(undefined, undefined, htmlTextSample(html))).toBe('rtl')
})

test('first strong direction ignores Arabic-Indic digits and recognizes historic RTL scripts', () => {
  expect(firstStrongDirection('١ English')).toBe('ltr')
  expect(firstStrongDirection('𐤀 English')).toBe('rtl')
})
