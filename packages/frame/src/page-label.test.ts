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
  let sheet: { style: ReturnType<typeof style>; frame?: typeof frame } | undefined
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
    replaceChildren(next?: typeof sheet) {
      sheet = next
      frame = next?.frame
    },
    querySelector: (selector: string) => (selector === 'iframe' ? (frame ?? null) : selector === '.segnavia-page__sheet' ? (sheet ?? null) : null),
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

test('a named page applies its cap and centering inline, including when unstyled', () => {
  const page = pageHarness()
  Object.assign(page, { hasAttribute: (name: string) => name === 'unstyled' })
  page.pageWidths = { standard: 900 }
  page.load({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' } })
  const sheet = page.querySelector<HTMLElement>('.segnavia-page__sheet')
  expect(sheet?.style.inlineSize).toBe('100%')
  expect(sheet?.style.maxInlineSize).toBe('900px')
  expect(sheet?.style.marginInline).toBe('auto')
})

test('equivalent page width assignments do not remount, while a changed width does', () => {
  const page = pageHarness()
  page.load({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' } })
  const initial = page.querySelector('iframe')
  page.pageWidths = { standard: 1024 }
  expect(page.querySelector('iframe')).toBe(initial)
  page.pageWidths = { standard: 900 }
  expect(page.querySelector('iframe')).not.toBe(initial)
})

test('page width assignments refuse an invalid field', () => {
  const page = pageHarness()
  expect(() => {
    page.pageWidths = { standard: 0 }
  }).toThrow('standard')
})
