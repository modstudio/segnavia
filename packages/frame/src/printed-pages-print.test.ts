import { afterEach, describe, expect, test } from 'bun:test'
import type { TextDirection } from '@segnavia/format'
import { DEFAULT_PAGE_LIMIT, Imposition, type LimitExceededError, limitRefusal, Page, PX_PER_MM } from '@segnavia/format'
import { resolvePageHtml, resolvePrintedPageHtml } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'
import { measurePrintedPageCount } from './printed-page-count.ts'
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

function fakeMeasurement(
  height: number,
  progress?: { pages: number; total: number },
): { styles: Array<{ cssText: string }>; documents: string[]; removed: { count: number } } {
  const styles: Array<{ cssText: string }> = []
  const documents: string[] = []
  const removed = { count: 0 }
  const messages = new EventTarget() as EventTarget & Pick<Window, 'setTimeout' | 'clearTimeout'>
  messages.setTimeout = globalThis.setTimeout.bind(globalThis) as Window['setTimeout']
  messages.clearTimeout = globalThis.clearTimeout.bind(globalThis) as Window['clearTimeout']
  const body = {
    append: (frame: { contentWindow: object }) => {
      queueMicrotask(() => {
        const dispatch = (data: object) => {
          const event = new MessageEvent('message', { data })
          Object.defineProperty(event, 'source', { value: frame.contentWindow })
          messages.dispatchEvent(event)
        }
        if (progress) dispatch({ type: MESSAGE.composeProgress, ...progress })
        dispatch({ type: MESSAGE.height, height })
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
        remove: () => removed.count++,
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
  return { styles, documents, removed }
}

describe('printedPagesPrintDocument', () => {
  test('refuses identity imposition across differing section papers by the first pair', async () => {
    const mixed = resolvePrintedPageHtml(
      Page.parse({
        print: { paper: 'letter' },
        style: {
          pageGeometries: {
            wide: {
              paper: 'letter',
              orientation: 'landscape',
              margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
            },
          },
        },
        printedPages: {
          parents: [{ name: 'body' }],
          parentRules: [{ parent: 'body' }],
          sections: [
            { id: 'one', pages: [{ html: '<p>One</p>' }] },
            { id: 'two', pageGeometry: 'wide', pages: [{ html: '<p>Two</p>' }] },
          ],
        },
      }),
    )
    await expect(printedPagesPrintDocument([mixed], identity, { deadlineAt: Date.now() + 100 })).rejects.toThrow(
      'page 1 geometry 215.9mm by 279.4mm and page 2 geometry 279.4mm by 215.9mm',
    )
  })

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

  test('counts completed mixed-height papers from compose progress', async () => {
    fakeMeasurement(2 * 279.4 * PX_PER_MM, { pages: 3, total: 3 })
    await expect(measurePrintedPageCount(printed(), {}, Date.now() + 100)).resolves.toBe(3)
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

  test('does not carry the host print base CSS into count measurement', async () => {
    const { documents } = fakeMeasurement(279.4 * PX_PER_MM)
    await printedPagesPrintDocument([printed()], identity, {
      deadlineAt: Date.now() + 100,
      baseCss: '.print-host-marker{break-before:page}',
    })

    expect(documents).toHaveLength(1)
    expect(documents[0]).not.toContain('print-host-marker')
  })

  test('an aborted count measurement removes its hidden frame and rejects with the abort reason', async () => {
    const { removed } = fakeMeasurement(279.4 * PX_PER_MM)
    const controller = new AbortController()
    const reason = new Error('superseded load')
    const measurement = measurePrintedPageCount(printed(), { signal: controller.signal }, Date.now() + 100)

    controller.abort(reason)

    await expect(measurement).rejects.toBe(reason)
    expect(removed.count).toBe(1)
  })
})
