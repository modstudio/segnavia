import { expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import { type BookPdfAdapter, bookPageCss, renderBookPdf } from './book-pdf.ts'
import { renderBrowserBookPdf } from './book-render.ts'

const continuousBook = (body: string, front?: string) =>
  parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    ...(front === undefined ? {} : { frontMatter: [{ title: 'Preface', html: front }] }),
    chapters: [{ id: 'body-section', title: 'One', html: body }],
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

async function printedPart(html: string, overrides: Record<string, number>, pages: number) {
  const document = await PDFDocument.create()
  const outputPages = Array.from({ length: pages }, () => {
    const page = document.addPage([419.53, 595.28])
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
    print: async (source, _book, slots, _options, part) => {
      slotMarks.push({ part, marked: [...slots.marked] })
      if (part === 'margin') {
        return {
          bytes: await printedPart('', {}, frontPages + bodyPages),
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
        bytes: await printedPart(source, { 'front-target': 1, 'body-target': targetPage }, pages),
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

test('places FontSource CSS before book CSS in the printed document', async () => {
  let srcdoc = ''
  await renderBrowserBookPdf(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      style: { css: '.book-rule{color:purple}' },
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [{ id: 'body-section', title: 'One', html: '<p class="book-rule">Text</p>' }],
    }),
    {},
    '.font-source-marker{font-family:Held}',
    {
      render: async (setup) => {
        srcdoc = setup.html
        const document = await PDFDocument.create()
        const page = document.addPage([419.53, 595.28])
        document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
        return {
          bytes: await document.save(),
          overflow: { part: 'body', pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
        }
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(srcdoc.indexOf('.font-source-marker')).toBeLessThan(srcdoc.indexOf('.book-rule{color:purple}'))
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
