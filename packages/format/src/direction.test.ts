import { expect, test } from 'bun:test'
import { htmlTextSample, resolveDirection } from './direction.ts'

test('resolves an HTML fragment from visible Hebrew text rather than markup', () => {
  const html = '<!-- English --><script>English</script><style>.English{}</style><template>English</template><p>שלום עולם</p>'
  expect(resolveDirection(undefined, undefined, htmlTextSample(html))).toBe('rtl')
})
