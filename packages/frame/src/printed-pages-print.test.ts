import { afterEach, describe, expect, test } from 'bun:test'
import { Imposition, Page, PRINTED_PAGE_LIMIT, PX_PER_MM } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import { printedPagesPrintDocument } from './printed-pages-print.ts'

const identity = Imposition.parse({ paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } })
const printed = (dir: 'ltr' | 'rtl' = 'ltr') =>
  Page.parse({
    html: '<p>flow</p>',
    dir,
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body', margin: { top: 18, bottom: 18, inner: 22, outer: 12 } }], rules: { every: 'body' } },
  })

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

function fakeMeasurement(height: number): Array<{ cssText: string }> {
  const styles: Array<{ cssText: string }> = []
  const messages = new EventTarget() as EventTarget & Pick<Window, 'setTimeout' | 'clearTimeout'>
  messages.setTimeout = globalThis.setTimeout.bind(globalThis) as Window['setTimeout']
  messages.clearTimeout = globalThis.clearTimeout.bind(globalThis) as Window['clearTimeout']
  const body = {
    append: (frame: { contentWindow: object }) => {
      queueMicrotask(() => {
        const event = new MessageEvent('message', { data: { type: MESSAGE.height, height } })
        Object.defineProperty(event, 'source', { value: frame.contentWindow })
        messages.dispatchEvent(event)
      })
    },
  }
  const document = {
    body,
    createElement: () => {
      const style = { cssText: '' }
      styles.push(style)
      return { contentWindow: {}, remove: () => {}, setAttribute: () => {}, style, srcdoc: '' }
    },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: messages })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  return styles
}

describe('printedPagesPrintDocument', () => {
  test('refuses a non-identity imposition with its remedy', async () => {
    const imposed = Imposition.parse({ paper: 'letter', columns: 2, rows: 1, cell: { width: 100, height: 279.4 } })
    await expect(printedPagesPrintDocument([printed()], imposed, { deadlineAt: Date.now() + 100 })).rejects.toThrow(
      'print without imposition to clear this refusal',
    )
  })

  test('refuses a measured count above the printed-page limit', async () => {
    fakeMeasurement((PRINTED_PAGE_LIMIT + 1) * 279.4 * PX_PER_MM)
    await expect(printedPagesPrintDocument([printed()], identity, { deadlineAt: Date.now() + 100 })).rejects.toThrow(
      `above the limit ${PRINTED_PAGE_LIMIT}; shorten the content`,
    )
  })

  test('uses a paper-sized viewport for LTR and RTL measuring and printable frames', async () => {
    const styles = fakeMeasurement(279.4 * PX_PER_MM)
    const result = await printedPagesPrintDocument([printed('ltr'), printed('rtl')], identity, { deadlineAt: Date.now() + 100 })
    expect(styles.map((style) => style.cssText)).toEqual([
      expect.stringContaining(`width:${215.9 * PX_PER_MM}px;height:${279.4 * PX_PER_MM}px`),
      expect.stringContaining(`width:${215.9 * PX_PER_MM}px;height:${279.4 * PX_PER_MM}px`),
    ])
    expect(result.html.match(/width:215\.9mm;height:279\.4mm;border:0;display:block/g)).toHaveLength(2)
    expect(result.html).not.toContain('width:431.8mm')
    expect(result.html).not.toContain('margin-left:')
  })
})
