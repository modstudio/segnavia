import { afterAll, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { loadPageValue } from './document-value-load.ts'

class TestElement extends EventTarget {}

const previousGlobals = new Map(['HTMLElement', 'ResizeObserver'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const))

Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})

afterAll(() => {
  for (const [name, previous] of previousGlobals) {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
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

  const newId = () => `host-${++next}`
  page.newId = newId
  page.newId = newId

  expect(page.page?.id).toBe('host-1')
  const child = page.page?.children[0]
  expect(child?.id).toBe('host-2')
  const html = child?.type === 'page' && child.body && 'html' in child.body ? child.body.html : undefined
  expect(html).toBe('<p data-segnavia-id="host-3">Page</p>')
})

test('parse option setters reload only the page representations they affect', () => {
  const page = new SegnaviaPage()
  const rendered: Page[] = []
  Object.assign(page, {
    loadValue(value: Page) {
      Reflect.set(this, 'pageValue', value)
      rendered.push(value)
    },
  })
  const value = Page.parse({ html: '<p>Page</p>' })
  loadPageValue(page, value)
  expect(rendered).toEqual([value])

  const newId = () => 'host-id'
  page.newId = newId
  page.newId = newId
  expect(rendered).toEqual([value])

  page.alertLabels = { note: 'Notice' }
  expect(rendered).toEqual([value, value])
})

test('a host-served URL cannot be replaced by parse option changes to an earlier input', () => {
  const page = new SegnaviaPage()
  let inputLoads = 0
  Object.assign(page, {
    fit() {},
    loadValue() {
      inputLoads++
    },
    mount: () => ({ src: '' }),
    releaseFrame() {},
  })
  page.load({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Earlier</p>' } }] })
  expect(inputLoads).toBe(1)

  const previousLocation = globalThis.location
  Object.assign(globalThis, { location: { href: 'https://host.example/' } })
  try {
    page.showUrl('/page')
    page.newId = () => 'host-id'
    page.alertLabels = { note: 'Notice' }
    page.brands = {
      source: {
        async brand() {
          return undefined
        },
      },
    }
    expect(inputLoads).toBe(1)
    expect(page.page).toBeNull()
  } finally {
    Object.assign(globalThis, { location: previousLocation })
  }
})
