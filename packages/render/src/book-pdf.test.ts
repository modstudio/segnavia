import { expect, test } from 'bun:test'
import { PressGeometry, pressBoxes, sheetMm, usesPressLayout } from '@segnavia/format'
import { bookDocument, parseBookFixture, planBookPages } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import { bookPageCss, marginFactsFor, marginVariablePagesFor, renderBookPdf as renderDatedBookPdf } from './book-pdf.ts'
import type { BookPdfAdapter } from './book-pdf-types.ts'

const currentDay = { date: '2026-11-14', zone: 'UTC', kind: 'current' as const }
const renderBookPdf = (input: Parameters<typeof renderDatedBookPdf>[0], options: Parameters<typeof renderDatedBookPdf>[1], adapter: BookPdfAdapter) =>
  renderDatedBookPdf(input, options, adapter, currentDay)

const continuousBook = (body: string, front?: string) =>
  parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    ...(front === undefined ? {} : { frontMatter: [{ title: 'Preface', html: front }] }),
    chapters: [{ id: 'body-section', title: 'One', html: body }],
  })

test('continuous margin facts select a host parent from the owning section rules', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    parentPages: [{ name: 'host', basedOn: 'segnavia:recto' }],
    chapters: [{ id: 'body-section', title: 'One', parentRules: [{ parent: 'host' }], html: '<p>Text</p>' }],
  })
  const sections = bookDocument(book).sections
  const destinations = new Map([['body-section', { page: 1, x: 0, y: 0 }]])
  const facts = marginFactsFor(sections, destinations, 1, new Set(), { system: 'arabic', printed: true }, [])

  expect(facts[0]?.parentRules).toEqual([{ parent: 'host' }])
  expect(planBookPages(facts, 'ltr')[0]?.parent).toBe('host')
})

test('continuous margin facts hide an unprinted folio while keeping its counted total', () => {
  const sections = [{ id: 'preface', kind: 'front' as const, division: 'front' as const, title: 'Preface' }]
  const destinations = new Map([['preface', { page: 1, x: 0, y: 0 }]])
  const facts = marginFactsFor(sections, destinations, 1, new Set(), { system: 'arabic', printed: false }, [])
  expect(facts[0]).toMatchObject({ folio: '', variables: { 'segnavia:pages-total': '1', 'segnavia:section-title': 'Preface' } })
})

test("continuous margin facts fall back to the book's parent rules", () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    parentPages: [{ name: 'host', basedOn: 'segnavia:recto' }],
    parentRules: [{ parent: 'host' }],
    chapters: [{ id: 'body-section', title: 'One', html: '<p>Text</p>' }],
  })
  const sections = [{ id: 'body-section', kind: 'chapter' as const, division: 'body' as const, title: 'One' }]
  const destinations = new Map([['body-section', { page: 1, x: 0, y: 0 }]])
  const facts = marginFactsFor(sections, destinations, 1, new Set(), { system: 'arabic', printed: true }, [], undefined, undefined, book.parentRules)

  expect(planBookPages(facts, 'ltr')[0]?.parent).toBe('host')
})

test('resolves record-page totals and document folios for the margin plan', () => {
  const sections = [{ id: 'record', kind: 'chapter' as const, division: 'body' as const, title: 'Record', record: { index: 2, count: 5 } }]
  const destinations = new Map([['record', { page: 2, x: 0, y: 0 }]])
  const bodyPages = marginVariablePagesFor(sections, destinations, 4, new Set())
  const facts = marginFactsFor(
    sections,
    destinations,
    4,
    new Set(),
    { system: 'roman-upper', printed: true },
    [
      { name: 'record-pages', kind: 'pages', of: 'record' },
      { name: 'document-folio', kind: 'folio', of: 'document' },
    ],
    {
      pages: [{ flow: 'front', blank: false, counted: true, record: false }, { flow: 'front', blank: false, counted: true, record: false }, ...bodyPages],
      offset: 2,
      system: 'roman-upper',
    },
  )
  expect(facts[2]?.variables).toMatchObject({ 'record-pages': 'III', 'document-folio': 'V' })
})

test('counts a blank inside a record the same way as the page plan', () => {
  const sections = [{ id: 'record', kind: 'chapter' as const, division: 'body' as const, title: 'Record', record: { index: 1, count: 1 } }]
  const destinations = new Map([['record', { page: 2, x: 0, y: 0 }]])
  const facts = marginFactsFor(sections, destinations, 2, new Set([1]), { system: 'arabic', printed: true }, [
    { name: 'record-folio', kind: 'folio', of: 'record' },
    { name: 'record-pages', kind: 'pages', of: 'record' },
  ])
  expect(facts).toEqual([
    { blank: true, sectionOpening: false },
    expect.objectContaining({ variables: expect.objectContaining({ 'record-folio': '2', 'record-pages': '2' }) }),
  ])
})

test('resolves a named enclosing part title only inside that part', () => {
  const sections = [
    { id: 'inside', kind: 'chapter' as const, division: 'body' as const, title: 'Inside', parts: { part: 'Part One' } },
    { id: 'outside', kind: 'chapter' as const, division: 'body' as const, title: 'Outside' },
  ]
  const destinations = new Map([
    ['inside', { page: 1, x: 0, y: 0 }],
    ['outside', { page: 2, x: 0, y: 0 }],
  ])
  const facts = marginFactsFor(sections, destinations, 2, new Set(), { system: 'arabic', printed: true }, [
    { name: 'part', kind: 'text', from: 'part-title', part: 'part', pick: 'first' },
  ])
  expect(facts[0]?.variables?.part).toBe('Part One')
  expect(facts[1]?.variables?.part).toBeUndefined()
})

test('resolves metadata variables in the continuous margin plan', () => {
  const sections = [{ id: 'chapter', kind: 'chapter' as const, division: 'body' as const, title: 'One' }]
  const destinations = new Map([['chapter', { page: 1, x: 0, y: 0 }]])
  const facts = marginFactsFor(
    sections,
    destinations,
    2,
    new Set(),
    { system: 'arabic', printed: true },
    [{ name: 'title', kind: 'meta', field: 'title' }],
    undefined,
    {
      lang: 'he',
      metadata: { title: 'ספר' },
    },
  )
  expect(facts.map(({ variables }) => variables)).toEqual([expect.objectContaining({ title: 'ספר' }), expect.objectContaining({ title: 'ספר' })])
})

test('maps asymmetric book margins to physical right and left pages independent of text direction', () => {
  const expected =
    '@page{size:148mm 210mm;margin-top:10mm;margin-bottom:11mm}@page :right{margin-left:30mm;margin-right:5mm}@page :left{margin-left:5mm;margin-right:30mm}'
  const input = {
    title: 'Book',
    mode: 'continuous' as const,
    page: { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 11, inlineStart: 30, inlineEnd: 5 } },
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  }
  expect(bookPageCss(parseBookFixture({ ...input, dir: 'ltr' }))).toBe(expected)
  expect(bookPageCss(parseBookFixture({ ...input, title: 'ספר', dir: 'rtl' }))).toBe(expected)
})

async function printedPart(html: string, overrides: Record<string, number>, pages: number, size = { width: 419.53, height: 595.28 }) {
  const document = await PDFDocument.create()
  const outputPages = Array.from({ length: pages }, () => {
    const page = document.addPage([size.width, size.height])
    page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    return page
  })
  const ids = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] as string))]
  const entries = ids.map((id) => [id, [outputPages[(overrides[id] ?? 1) - 1]?.ref, PDFName.of('XYZ'), 0, 595.28, null]])
  document.catalog.set(PDFName.of('Dests'), document.context.obj(Object.fromEntries(entries)))
  return document.save()
}

function scriptedAdapter(destinationPage: (part: 'front' | 'body', print: number) => number): BookPdfAdapter & {
  html: Record<'front' | 'body', string[]>
  slotMarks: Array<{ part: 'front' | 'body' | 'margin'; marked: Array<[string, number]> }>
} {
  const html = { front: [] as string[], body: [] as string[] }
  const slotMarks: Array<{ part: 'front' | 'body' | 'margin'; marked: Array<[string, number]> }> = []
  let frontPages = 0
  let bodyPages = 0
  return {
    html,
    slotMarks,
    print: async (source, book, slots, _options, part) => {
      if (!book.page) throw new Error('test book needs page')
      const trim = sheetMm(book.page)
      const sourceSize = book.print && usesPressLayout(book.print) ? pressBoxes(trim, book.print).bleedBox : trim
      const pdfSize = { width: (sourceSize.width * 72) / 25.4, height: (sourceSize.height * 72) / 25.4 }
      slotMarks.push({ part, marked: [...slots.marked] })
      if (part === 'margin') {
        return {
          bytes: await printedPart('', {}, frontPages + bodyPages, pdfSize),
          overflow: { part, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
        }
      }
      const history = html[part]
      history.push(source)
      const targetPage = destinationPage(part, history.length)
      const pages = part === 'front' ? 1 : Math.max(1, targetPage)
      if (part === 'front') frontPages = pages
      else bodyPages = pages
      return {
        bytes: await printedPart(source, { 'front-target': 1, 'body-target': targetPage }, pages, pdfSize),
        overflow: { part, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
      }
    },
    finish: async (pdf) => pdf,
  }
}

test('passes each book print only the slot marks for the fields in that part', async () => {
  const adapter = scriptedAdapter(() => 1)
  await renderBookPdf(
    continuousBook('<p data-slot-value="name">Body</p>', '<p data-slot-value="name">Front</p>'),
    {
      slots: {
        declarations: [{ key: 'name', label: 'Name', type: 'text', overflow: 'refuse' }],
        fill: { id: 'host', values: { name: 'Ada' } },
      },
    },
    adapter,
  )

  expect(adapter.slotMarks.filter(({ part }) => part === 'body').every(({ marked }) => Bun.deepEquals(marked, [['name', 1]]))).toBe(true)
  expect(adapter.slotMarks.filter(({ part }) => part === 'front').every(({ marked }) => Bun.deepEquals(marked, [['name', 1]]))).toBe(true)
  expect(adapter.slotMarks.filter(({ part }) => part === 'margin').map(({ marked }) => marked)).toEqual([[]])
})

test('book bleed pads the composed source and writes media and trim boxes on every page', async () => {
  const plain = continuousBook('<p>Body</p>')
  const pressed = { ...plain, print: PressGeometry.parse({ bleed: 3 }) }
  expect(bookPageCss(pressed)).toContain('@page{size:154mm 216mm;margin-top:13mm;margin-bottom:13mm}')
  const plainBytes = await renderBookPdf(
    plain,
    {},
    scriptedAdapter(() => 1),
  )
  const pressedBytes = await renderBookPdf(
    pressed,
    {},
    scriptedAdapter(() => 1),
  )
  const plainPdf = await PDFDocument.load(plainBytes)
  const pressedPdf = await PDFDocument.load(pressedBytes)
  expect(pressedPdf.getPageCount()).toBe(plainPdf.getPageCount())
  for (const page of pressedPdf.getPages()) {
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.getMediaBox()).toEqual(page.getBleedBox())
    expect(page.getTrimBox().x).toBeCloseTo((3 * 72) / 25.4)
    expect(page.getTrimBox().y).toBeCloseTo((3 * 72) / 25.4)
  }
})

test('reprints a growing page reference until its moved target settles', async () => {
  const adapter = scriptedAdapter((part, print) => (part === 'body' && print === 1 ? 9 : 10))
  await renderBookPdf(continuousBook('<p>See <a href="#body-target" data-ref="page"></a></p><p id="body-target">Target</p>'), {}, adapter)
  expect(adapter.html.body).toHaveLength(4)
  expect(adapter.html.body.at(-1)).toContain('>10</a>')
})

test('refuses body destinations that never settle', async () => {
  const adapter = scriptedAdapter((part, print) => (part === 'body' ? 8 + print : 1))
  expect(renderBookPdf(continuousBook('<p>See <a href="#body-target" data-ref="page"></a></p><p id="body-target">Target</p>'), {}, adapter)).rejects.toThrow(
    'Body page references to body-target did not converge after three reprints',
  )
})

test('prints a continuous body without page references as many times as before page references', async () => {
  const adapter = scriptedAdapter(() => 1)
  await renderBookPdf(continuousBook('<p id="body-target">No body references</p>', '<p>Body is <a href="#body-target" data-ref="page"></a></p>'), {}, adapter)
  expect(adapter.html.body).toHaveLength(1)
  expect(adapter.html.front).toHaveLength(2)
  expect(adapter.html.front.at(-1)).toContain('>1</a>')
})

test('alternates front and body until the front uses the settled body number', async () => {
  const adapter = scriptedAdapter((part, print) => (part === 'body' && print === 1 ? 9 : 10))
  await renderBookPdf(
    continuousBook(
      '<p>Front is <a href="#front-target" data-ref="page"></a></p><p id="body-target">Body target</p>',
      '<p id="front-target">Front target</p><p>Body is <a href="#body-target" data-ref="page"></a></p>',
    ),
    {},
    adapter,
  )
  expect(adapter.html.front).toHaveLength(4)
  expect(adapter.html.front.at(-1)).toContain('>10</a>')
})

test('prints a paginated book once then finishes', async () => {
  const printedBook = async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([419.53, 595.28])
    page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
    return document.save()
  }
  let prints = 0
  let finishes = 0
  const output = await renderBookPdf(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [{ id: 'body-section', title: 'One', html: '<p>Text</p>' }],
    }),
    {},
    {
      print: async () => {
        prints += 1
        return { bytes: await printedBook(), overflow: { part: 'body', pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] } }
      },
      finish: async (pdf) => {
        finishes += 1
        return pdf
      },
    },
  )
  expect(prints).toBe(1)
  expect(finishes).toBe(1)
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1)
})

test('renders with a class-instance adapter whose methods are on its prototype', async () => {
  class Adapter implements BookPdfAdapter {
    prints = 0
    finishes = 0

    async print() {
      this.prints += 1
      const document = await PDFDocument.create()
      const page = document.addPage([419.53, 595.28])
      document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
      return {
        bytes: await document.save(),
        overflow: { part: 'body' as const, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
      }
    }

    async finish(pdf: Uint8Array) {
      this.finishes += 1
      return pdf
    }
  }

  const adapter = new Adapter()
  const output = await renderBookPdf(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [{ id: 'body-section', title: 'One', html: '<p>Text</p>' }],
    }),
    {},
    adapter,
  )

  expect(adapter.prints).toBe(1)
  expect(adapter.finishes).toBe(1)
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1)
})

test('corrects every joined book page to the exact trim before finishing', async () => {
  const printedBookPart = async () => {
    const document = await PDFDocument.create()
    const first = document.addPage([612.96, 792.96])
    first.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    const second = document.addPage([612.96, 792.96])
    second.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [first.ref, PDFName.of('XYZ'), 0, 792.96, null] }))
    return document.save()
  }
  let finished: Uint8Array | undefined
  const output = await renderBookPdf(
    parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      page: { paper: 'letter', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [{ id: 'body-section', title: 'One', html: '<p>Text</p>' }],
    }),
    {},
    {
      print: async () => ({
        bytes: await printedBookPart(),
        overflow: { part: 'body', pageWidth: 816, extent: 816, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
      }),
      finish: async (pdf) => {
        finished = pdf
        return pdf
      },
    },
  )
  expect(finished).toEqual(output)
  const pages = (await PDFDocument.load(output)).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    const box = page.getMediaBox()
    expect(box.x).toBe(0)
    expect(box.y).toBe(0)
    expect(box.width).toBeCloseTo(612, 2)
    expect(box.height).toBeCloseTo(792, 2)
  }
})
