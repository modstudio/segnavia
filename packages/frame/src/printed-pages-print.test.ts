import { afterEach, describe, expect, test } from 'bun:test'
import type { TextDirection } from '@segnavia/format'
import { DEFAULT_PAGE_LIMIT, Imposition, type LimitExceededError, limitRefusal, Page, PX_PER_MM } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'
import { printedPagesPrintDocument } from './printed-pages-print.ts'

const identity = Imposition.parse({ paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } })
const printed = (dir: TextDirection = 'ltr') =>
  resolvePageHtml(
    Page.parse({
      html: '<p>flow</p>',
      dir,
      print: { paper: 'letter' },
      printedPages: {
        parents: [{ name: 'body', margin: { blockStart: 18, blockEnd: 18, inlineStart: 22, inlineEnd: 12 } }],
        parentRules: [{ parent: 'body' }],
      },
    }),
  )

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else Reflect.deleteProperty(globalThis, 'document')
})

function fakeMeasurement(height: number): { styles: Array<{ cssText: string }>; documents: string[] } {
  const styles: Array<{ cssText: string }> = []
  const documents: string[] = []
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
      return {
        contentWindow: {},
        remove: () => {},
        setAttribute: () => {},
        style,
        set srcdoc(value: string) {
          documents.push(value)
        },
      }
    },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: messages })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  return { styles, documents }
}

describe('printedPagesPrintDocument', () => {
  test('refuses a non-identity imposition with its remedy', async () => {
    const imposed = Imposition.parse({ paper: 'letter', columns: 2, rows: 1, cell: { width: 100, height: 279.4 } })
    await expect(printedPagesPrintDocument([printed()], imposed, { deadlineAt: Date.now() + 100 })).rejects.toThrow(
      'print without imposition to clear this refusal',
    )
  })

  test('refuses a measured count above the printed-page limit', async () => {
    fakeMeasurement((DEFAULT_PAGE_LIMIT + 1) * 279.4 * PX_PER_MM)
    const printing = printedPagesPrintDocument([printed()], identity, { deadlineAt: Date.now() + 100 })
    await expect(printing).rejects.toThrow(limitRefusal('pages', DEFAULT_PAGE_LIMIT + 1, DEFAULT_PAGE_LIMIT, { pagesSource: 'default' }))
    await expect(printing).rejects.toMatchObject({
      exceeded: [
        {
          measure: 'pages',
          limit: DEFAULT_PAGE_LIMIT,
          actual: DEFAULT_PAGE_LIMIT + 1,
          message: limitRefusal('pages', DEFAULT_PAGE_LIMIT + 1, DEFAULT_PAGE_LIMIT, { pagesSource: 'default' }),
        },
      ],
    } satisfies Partial<LimitExceededError>)
  })

  test('uses a paper-sized viewport for LTR and RTL measuring and printable frames', async () => {
    const { styles } = fakeMeasurement(279.4 * PX_PER_MM)
    const width = Math.ceil(215.9 * PX_PER_MM - 1e-9)
    const height = Math.ceil(279.4 * PX_PER_MM - 1e-9)
    const result = await printedPagesPrintDocument([printed('ltr'), printed('rtl')], identity, { deadlineAt: Date.now() + 100 })
    expect(styles.map((style) => style.cssText)).toEqual([
      expect.stringContaining(`width:${width}px;height:${height}px`),
      expect.stringContaining(`width:${width}px;height:${height}px`),
    ])
    expect(result.html.match(new RegExp(`width:${width}px;height:${height}px;border:0;display:block`, 'g'))).toHaveLength(2)
    expect(result.html.match(/&quot;expectedCount&quot;:1/g)).toHaveLength(2)
    expect(result.sheets).toBe(2)
    expect(result.html).not.toContain('width:431.8mm')
    expect(result.html).not.toContain('margin-left:')
  })

  test('carries approved image origins into measuring and composed frames', async () => {
    const { documents } = fakeMeasurement(279.4 * PX_PER_MM)
    const origins = [{ origin: 'https://images.example', kinds: ['image'] as const }]
    const result = await printedPagesPrintDocument([printed()], identity, { deadlineAt: Date.now() + 100, origins })

    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatch(/img-src [^;]*https:\/\/images\.example/)
    expect(result.html).toMatch(/img-src [^;]*https:\/\/images\.example/)
  })
})
