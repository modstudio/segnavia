import { expect, test } from 'bun:test'
import { paragraphLineNodes } from './composer-paragraph-dom.ts'

test('builds line nodes without writing the source paragraph', () => {
  let replaced = false
  const text = { nodeType: 3, data: 'one', parentElement: {} } as Text
  const paragraph = {
    querySelectorAll: () => [],
    replaceChildren: () => {
      replaced = true
    },
  } as unknown as Element
  const doc = {
    createDocumentFragment: () => ({ append: () => undefined, querySelectorAll: () => [] }),
    createTextNode: (data: string) => ({ data }),
    createElement: () => ({
      style: { cssText: '' },
      setAttribute: () => undefined,
      append: () => undefined,
      dir: '',
    }),
  } as unknown as Document
  const output = paragraphLineNodes(
    paragraph,
    [{ kind: 'text', text: 'one', width: 3, node: text, start: 0, end: 3 }],
    [{ start: 0, end: 1, wordSpacing: 0, hyphen: false, forced: false }],
    doc,
    'ltr',
    'data-identity',
    'data-continuation',
    'data-variable-value',
  )
  expect(replaced).toBe(false)
  expect(output).toHaveLength(1)
  expect(output[0]?.style.cssText).toContain('text-align:start')
})
