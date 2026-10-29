import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'

function style() {
  return {
    height: '',
    transform: '',
    removeProperty(name: string) {
      if (name === 'height') this.height = ''
      if (name === 'transform') this.transform = ''
    },
  }
}

class TestElement extends EventTarget {
  private attributes = new Set<string>()
  clientWidth = 0
  dataset: Record<string, string> = {}
  style = style()

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  toggleAttribute(name: string, force?: boolean) {
    const oldValue = this.attributes.has(name) ? '' : null
    const present = force ?? !this.attributes.has(name)
    if (present) this.attributes.add(name)
    else this.attributes.delete(name)
    if ((present ? '' : null) !== oldValue)
      void (this as unknown as { attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void }).attributeChangedCallback(
        name,
        oldValue,
        present ? '' : null,
      )
    return present
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

function pageHarness(size: Page['size'], fill = false) {
  const page = new SegnaviaPage()
  const attributes = new Set<string>()
  Object.defineProperties(page, {
    clientWidth: { configurable: true, value: 200 },
    dataset: { configurable: true, value: {} },
    style: { configurable: true, value: style() },
  })
  Object.assign(page, {
    hasAttribute: (name: string) => attributes.has(name),
    toggleAttribute(name: string, force?: boolean) {
      const oldValue = attributes.has(name) ? '' : null
      const present = force ?? !attributes.has(name)
      if (present) attributes.add(name)
      else attributes.delete(name)
      if ((present ? '' : null) !== oldValue) void page.attributeChangedCallback(name, oldValue, present ? '' : null)
      return present
    },
  })
  const sheet = { style: style() }
  const frame = { contentWindow: {} }
  ;(page as unknown as { pageValue: Page }).pageValue = Page.parse({ html: '<p>Page</p>', size })
  ;(page as unknown as { contentHeight: number }).contentHeight = typeof size === 'object' && size.height !== 'auto' ? size.height : 0
  ;(page as unknown as { querySelector(selector: string): unknown }).querySelector = (selector) =>
    selector === '.segnavia-page__sheet' ? sheet : selector === 'iframe' ? frame : null
  if (fill) page.fill = true
  return {
    page,
    sheet,
    frame,
    height(value: number) {
      ;(page as unknown as { onMessage(event: MessageEvent): void }).onMessage({
        source: frame.contentWindow,
        data: { type: MESSAGE.height, height: value },
      } as MessageEvent)
    },
  }
}

test('fill keeps a measured fluid page in the host-sized box', () => {
  const { page, sheet, height } = pageHarness('fluid', true)
  expect(page.dataset.height).toBeUndefined()
  height(640)
  expect(page.style.height).toBe('')
  expect(sheet.style.height).toBe('100%')
  expect(sheet.style.transform).toBe('')
  expect(page.dataset).toMatchObject({ height: '640', measured: '' })
})

test('a fluid page grows to its measured content without fill', () => {
  const { page, sheet, height } = pageHarness('fluid')
  height(640)
  expect(sheet.style.height).toBe('640px')
  expect(page.style.height).toBe('640px')
  expect(page.dataset.height).toBe('640')
})

test('a fixed page ignores fill and keeps scaling', () => {
  const { page, sheet } = pageHarness({ width: 400, height: 300 }, true)
  expect(sheet.style.height).toBe('300px')
  expect(sheet.style.transform).toBe('scale(0.5)')
  expect(page.style.height).toBe('150px')
})

test('toggling fill refits the same fluid frame without reloading it', () => {
  const { page, frame, height } = pageHarness('fluid')
  height(640)
  const mounted = page.querySelector('iframe')
  page.fill = true
  expect(page.fill).toBe(true)
  expect(page.style.height).toBe('')
  page.fill = false
  expect(page.fill).toBe(false)
  expect(page.style.height).toBe('640px')
  expect(page.querySelector('iframe')).toBe(mounted)
  expect(page.querySelector('iframe') as unknown).toBe(frame)
})
