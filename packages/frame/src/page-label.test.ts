import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { internalPageDayLoad } from './document-value-load.ts'
import { toggleTestAttribute } from './page-element.test-helper.ts'

class TestElement extends EventTarget {
  toggleAttribute(name: string, force?: boolean) {
    return toggleTestAttribute(this as never, name, force)
  }
}

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
    toggleAttribute(name: string, force?: boolean) {
      return toggleTestAttribute(this, name, force)
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

const content = {
  type: 'document' as const,
  kind: 'page' as const,
  size: 'fluid' as const,
  children: [{ type: 'page' as const, body: { html: '<p>Page</p>' } }],
}
const measured = (html: string) => ({
  type: 'document' as const,
  kind: 'page' as const,
  size: { width: 'standard' as const, height: 'auto' as const },
  children: [{ type: 'page' as const, body: { html } }],
})

test('a label names the mounted page frame', () => {
  const page = pageHarness()
  page.label = 'Notice'
  page.load(content)
  expect(page.querySelector<HTMLIFrameElement>('iframe')?.title).toBe('Notice')
})

test('reports the one as-of day used by a page load', () => {
  const page = pageHarness()
  const days: unknown[] = []
  page.moment = Date.parse('2026-11-14T04:30:00Z')
  page.asOf = { zone: 'America/New_York' }
  page.addEventListener('asof', (event) => days.push((event as CustomEvent).detail))
  page.load(content)
  expect(days).toEqual([{ date: '2026-11-13', zone: 'America/New_York', kind: 'current', moment: Date.parse('2026-11-14T04:30:00Z') }])
})

test('a page given an established document day does not resolve or report it again', () => {
  const page = pageHarness()
  let anchorCalls = 0
  let slotCalls = 0
  let events = 0
  page.anchors = {
    choices: [{ name: 'week', label: 'Week' }],
    resolve: () => {
      anchorCalls++
      return '2026-11-09'
    },
  }
  page.slots = {
    resolve: async () => {
      slotCalls++
      return undefined
    },
  }
  page.addEventListener('asof', () => events++)

  page[internalPageDayLoad](Page.parse({ html: '<p>Page</p>', asOf: { kind: 'anchor', anchor: 'week' } }), {
    day: { date: '2026-11-09', zone: 'UTC', kind: 'anchor', anchor: 'week' },
    slots: { source: { id: 'week', values: {} } },
  })

  expect({ anchorCalls, slotCalls, events }).toEqual({ anchorCalls: 0, slotCalls: 0, events: 0 })
})

test('the mounted page frame resolves its root direction from the page language', () => {
  const page = pageHarness()
  page.load({ ...content, settings: { lang: 'he' } })
  expect(page.querySelector<HTMLIFrameElement>('iframe')?.srcdoc).toContain('<html dir="rtl" lang="he">')
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
  page.load({ type: 'document', kind: 'page', size: 'fluid', children: [{ type: 'page', body: { html: '<p>Later page</p>' } }] })
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
  page.load(measured('<p>Measured</p>'))
  const sheet = page.querySelector<HTMLElement>('.segnavia-page__sheet')
  expect(sheet?.style.inlineSize).toBe('100%')
  expect(sheet?.style.maxInlineSize).toBe('900px')
  expect(sheet?.style.marginInline).toBe('auto')
})

test('equivalent page width assignments do not remount, while a changed width does', () => {
  const page = pageHarness()
  page.load(measured('<p>Measured</p>'))
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
