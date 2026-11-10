import { expect, test } from 'bun:test'
import { Page as PageSchema, PX_PER_MM, sheetMm } from '@segnavia/format'
import { prepareSlotCollection, prepareSlots, resolvePageHtml, resolvePrintedPageHtml, UnmeasuredSlotsRefusedError } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import type { Page as BrowserPage } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { enforce } from './pdf-finish.ts'
import { pt } from './pdf-geometry.ts'
import { filledPages } from './slot-fill.ts'
import { mergeCapturedSlotFit } from './slot-fit.ts'

const Page = { parse: (input: unknown) => resolvePageHtml(PageSchema.parse(input)) }
const preparedSlots = await prepareSlots(undefined)

async function cssPiece(pixels: number, height = pixels): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([pt(pixels / PX_PER_MM), pt(height / PX_PER_MM)]).drawText('Card')
  return document.save()
}

function drawScale(content: string): { x: number; y: number } {
  const match = [...content.matchAll(/([+-]?(?:\d+\.?\d*|\.\d+)) 0 0 ([+-]?(?:\d+\.?\d*|\.\d+)) [+-]?(?:\d+\.?\d*|\.\d+) [+-]?(?:\d+\.?\d*|\.\d+) cm/g)].at(-1)
  if (!match) throw new Error(`no placement transform in: ${content}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

test('pagesPdf refuses an empty collection with the action that clears it', async () => {
  const render = renderPagesPdf(
    [],
    preparedSlots,
    {},
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow(new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.'))
})

test('pagesPdf refuses progress because the report is scoped to one composition', async () => {
  const page = Page.parse({ html: '<p>Card</p>' })
  const render = renderPagesPdf(
    [page],
    preparedSlots,
    { progress: { report: () => {} } },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow(
    'The progress option is reported per single composition; pagesPdf would compose multiple documents. Remove progress and call pagePdf once per page',
  )
})

test('pagesPdf renders the page objects with a document view of the prepared slots', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 336, height: 192 } })
  const seen: unknown[] = []
  const render = renderPagesPdf(
    [page],
    preparedSlots,
    {},
    {
      pagePdf: async (rendered, slots) => {
        seen.push(rendered)
        expect(slots).not.toBe(preparedSlots)
        expect(slots.report).toBe(preparedSlots.report)
        expect(slots.marked.size).toBe(0)
        throw new Error('stop after the first page')
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('stop after the first page')
  expect(seen[0]).toBe(page)
})

test('pagesPdf gives each page only its own slot measurement marks', async () => {
  const declarations = [{ key: 'name', label: 'Name', type: 'text' as const, required: false, overflow: 'refuse' as const }]
  const slots = await prepareSlotCollection([declarations, declarations], { fill: { id: 'host', values: { name: 'Ada' } } })
  const pages = [Page.parse({ html: slots.apply('<p data-slot-value="name">Name</p>') }), Page.parse({ html: slots.apply('<p>Unbound</p>') })]
  const tab = {
    waitForFunction: async () => {
      throw new Error('deadline')
    },
    evaluate: async () => [],
  } as unknown as BrowserPage
  const outcomes: Array<unknown> = []
  await renderPagesPdf(
    pages,
    slots,
    {},
    {
      pagePdf: async (_page, pageSlots, _options, inputIndex) => {
        outcomes[inputIndex] = await mergeCapturedSlotFit(tab, pageSlots, 100).catch((error) => error)
        return { bytes: await cssPiece(100) }
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(outcomes[0]).toBeInstanceOf(UnmeasuredSlotsRefusedError)
  expect(outcomes[1]).toBeUndefined()
})

test('pagesPdf keeps every input aligned with the slot frames its HTML produced', async () => {
  const sectioned = resolvePrintedPageHtml(
    PageSchema.parse({
      scripts: 'refuse',
      print: { paper: 'letter' },
      slots: [{ key: 'section', label: 'Section', type: 'text', overflow: 'refuse' }],
      printedPages: {
        parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
        parentRules: [{ parent: 'body' }],
        sections: [
          { id: 'one', html: '<p data-slot-value="section">One</p>' },
          { id: 'two', html: '<p data-slot-value="section">Two</p>' },
        ],
      },
    }),
  )
  const plain = Page.parse({
    html: '<p data-slot-value="plain">Plain</p>',
    slots: [{ key: 'plain', label: 'Plain', type: 'text', overflow: 'refuse' }],
  })
  const { value, slots, frameGroups } = await filledPages([sectioned, plain], {
    fill: { id: 'host', values: { section: 'Filled section', plain: 'Filled plain' } },
  })
  const seen: Array<{ frames: number; marked: string[] }> = []

  await renderPagesPdf(
    value,
    slots,
    {},
    {
      pagePdf: async (_page, documentSlots, _options, inputIndex) => {
        seen[inputIndex] = { frames: documentSlots.frames.length, marked: [...documentSlots.marked.keys()] }
        return { bytes: await cssPiece(100) }
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    frameGroups,
  )

  expect(frameGroups).toEqual([[0, 1], [2]])
  expect(seen).toEqual([
    { frames: 2, marked: ['section'] },
    { frames: 1, marked: ['plain'] },
  ])
})

test('pagesPdf applies sheets to the joined output instead of each inner page', async () => {
  const inputs = [Page.parse({ html: '<p>One</p>', size: { width: 336, height: 192 } }), Page.parse({ html: '<p>Two</p>', size: { width: 336, height: 192 } })]
  const innerLimits: unknown[] = []
  const render = renderPagesPdf(
    inputs,
    preparedSlots,
    { limits: { sheets: 1 } },
    {
      pagePdf: async (_page, _slots, options) => {
        innerLimits.push(options.limits)
        return { bytes: await enforce(await cssPiece(100), options.limits) }
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: (pdf, options) => enforce(pdf, options.limits),
    },
  )
  await expect(render).rejects.toThrow('sheets limit of 1')
  expect(innerLimits).toEqual([{}, {}])
})

test('pagesPdf carries a named width override into the imposed piece', async () => {
  const page = Page.parse({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' } })
  const widths: number[] = []
  await renderPagesPdf(
    [page],
    preparedSlots,
    {
      pageWidths: { standard: 900 },
      imposition: {
        paper: 'poster-12x18',
        orientation: 'landscape',
        columns: 1,
        rows: 1,
        cell: { width: 305, height: 200 },
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async (_page, _slots, geometry) => {
        widths.push(geometry.viewport.width)
        return cssPiece(geometry.viewport.width, geometry.viewport.height)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(widths).toEqual([900])
})

test('pagesPdf refuses an invalid named width at the render options boundary', async () => {
  const page = Page.parse({ html: '<p>Measured</p>', size: { width: 'standard', height: 'auto' } })
  const render = renderPagesPdf(
    [page],
    preparedSlots,
    { pageWidths: { standard: 0 } },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('standard')
})

test('pagesPdf reports marks omitted from a narrow imposition margin without refusing', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 100, height: 100 } })
  const reports: unknown[] = []
  const bytes = await renderPagesPdf(
    [page],
    preparedSlots,
    {
      imposition: {
        paper: { width: 30, height: 30, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 20, height: 20 },
        margin: { top: 2, right: 5, bottom: 5, left: 5 },
        marks: true,
      },
      marks: { report: (report) => reports.push(report) },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => cssPiece(100),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(bytes.length).toBeGreaterThan(0)
  expect(reports).toEqual([
    {
      omittedMarks: [
        { side: 'front', edge: 'top', cutPosition: 5 },
        { side: 'front', edge: 'top', cutPosition: 25 },
      ],
    },
  ])
})

test('an imposed pagesPdf with registration marks strokes Separation All', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 80, height: 80 } })
  const bytes = await renderPagesPdf(
    [page],
    preparedSlots,
    {
      imposition: {
        paper: { width: 40, height: 40, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 20, height: 20 },
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        marks: true,
        markColor: 'registration',
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => cssPiece(80),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})

test('an imposed fluid letter piece whose printed page was snapped is drawn at scale 1', async () => {
  const letter = sheetMm({ paper: 'letter', orientation: 'portrait' })
  const page = Page.parse({ html: '<p>Letter</p>', size: 'fluid' })
  const snapped = await PDFDocument.create()
  snapped.addPage([pt(letter.width), pt(letter.height) + 0.7]).drawRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const bytes = await renderPagesPdf(
    [page],
    preparedSlots,
    {
      imposition: {
        paper: 'letter',
        columns: 1,
        rows: 1,
        cell: { width: letter.width, height: letter.height },
      },
    },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => snapped.save(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const scale = drawScale(await pageContent(bytes))
  expect(scale.x).toBe(1)
  expect(scale.y).toBe(1)
})

test('pagesPdf refuses a non-identity imposition for printed pages with its remedy', async () => {
  const page = Page.parse({
    html: '<p>Flow</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  })
  const render = renderPagesPdf(
    [page],
    preparedSlots,
    { imposition: { paper: 'letter', columns: 2, rows: 1, cell: { width: 100, height: 279.4 } } },
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('print without imposition to clear this refusal')
})

test('identity-imposed printed pages use full page rendering while plain neighbors keep their placement path', async () => {
  const printed = Page.parse({
    html: '<p>Flow</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  })
  const plain = Page.parse({ html: '<p>Plain</p>', size: 'fluid' })
  const calls: string[] = []
  const onePage = async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([612, 792])
    return pdf.save()
  }
  await renderPagesPdf(
    [printed, plain],
    preparedSlots,
    { imposition: { paper: 'letter', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } } },
    {
      pagePdf: async () => {
        calls.push('page')
        return { bytes: await onePage() }
      },
      piecePdf: async () => {
        calls.push('piece')
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(calls).toEqual(['page', 'piece'])
})
