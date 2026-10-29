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

function style() {
  return {
    height: '',
    transform: '',
    width: '',
    removeProperty(name: string) {
      if (name === 'height') this.height = ''
      if (name === 'transform') this.transform = ''
    },
  }
}

function pageHarness() {
  const page = new SegnaviaPage()
  const attributes = new Map<string, string>()
  let frame: { title: string; srcdoc?: string; setAttribute(name: string, value: string): void } | undefined
  Object.defineProperties(page, {
    clientWidth: { configurable: true, value: 200 },
    dataset: { configurable: true, value: {} },
    isConnected: { configurable: true, value: true },
    style: { configurable: true, value: style() },
  })
  Object.assign(page, {
    dispatchEvent: () => true,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute(name: string, value: string) {
      const oldValue = attributes.get(name) ?? null
      attributes.set(name, String(value))
      if (oldValue !== String(value)) void page.attributeChangedCallback(name, oldValue, String(value))
    },
    removeAttribute(name: string) {
      const oldValue = attributes.get(name) ?? null
      attributes.delete(name)
      if (oldValue !== null) void page.attributeChangedCallback(name, oldValue, null)
    },
    replaceChildren(sheet?: { frame?: typeof frame }) {
      frame = sheet?.frame
    },
    querySelector: (selector: string) => (selector === 'iframe' ? (frame ?? null) : null),
  })
  Object.assign(globalThis, {
    document: {
      createElement(tag: string) {
        if (tag === 'iframe')
          return {
            title: '',
            addEventListener() {},
            setAttribute() {},
          }
        return {
          className: '',
          dir: '',
          style: style(),
          frame: undefined as typeof frame,
          append(child: typeof frame) {
            this.frame = child
          },
        }
      },
    },
  })
  return page
}

const content = { html: '<p>Page</p>', size: 'fluid' as const }

test('a label names the mounted page frame', () => {
  const page = pageHarness()
  page.label = 'Notice'
  page.load(content)
  expect(page.querySelector<HTMLIFrameElement>('iframe')?.title).toBe('Notice')
})

test('changing the label retitles the mounted frame in place', () => {
  const page = pageHarness()
  page.load(content)
  const frame = page.querySelector<HTMLIFrameElement>('iframe')
  page.label = 'Preview'
  expect(page.querySelector('iframe')).toBe(frame)
  expect(frame?.title).toBe('Preview')
})

test('the label names a later frame mounted by load', () => {
  const page = pageHarness()
  page.label = 'Notice'
  page.load(content)
  const first = page.querySelector('iframe')
  page.load({ html: '<p>Later page</p>', size: 'fluid' })
  const later = page.querySelector<HTMLIFrameElement>('iframe')
  expect(later).not.toBe(first)
  expect(later?.title).toBe('Notice')
})

test('the default frame title returns when the label is removed', () => {
  const page = pageHarness()
  page.load(content)
  expect(page.querySelector<HTMLIFrameElement>('iframe')?.title).toBe('Page')
  page.label = 'Notice'
  page.label = ''
  expect(page.querySelector<HTMLIFrameElement>('iframe')?.title).toBe('Page')
})
