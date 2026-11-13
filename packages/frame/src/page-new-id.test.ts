import { expect, test } from 'bun:test'

class TestElement extends EventTarget {}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})

const { SegnaviaPage } = await import('./page.ts')

test('newId mints the exact ids for a document loaded by the page element', () => {
  const page = new SegnaviaPage()
  Object.assign(page, { loadValue() {} })
  let next = 0
  const input = {
    type: 'document',
    kind: 'page',
    size: 'fluid',
    children: [{ type: 'page', body: { html: '<p>Page</p>' } }],
  } as const
  page.load(input)

  page.newId = () => `host-${++next}`

  expect(page.page?.id).toBe('host-1')
  const child = page.page?.children[0]
  expect(child?.id).toBe('host-2')
  const html = child?.type === 'page' && child.body && 'html' in child.body ? child.body.html : undefined
  expect(html).toBe('<p data-segnavia-id="host-3">Page</p>')
})
