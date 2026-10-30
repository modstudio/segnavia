import { describe, expect, test } from 'bun:test'
import type { BookSectionInfo } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { BookDestination } from './book-destinations.ts'
import { type BookPdfAdapter, bookPartsPrintStatus, frontPrintStatus, pageReferencePrintStatus, renderBookPdf } from './book-pdf.ts'
import { renderBrowserBookPdf } from './book-render.ts'

const sections: BookSectionInfo[] = [{ id: 'segnavia-front-1', kind: 'front', division: 'front', title: 'Preface' }]
const destinations = (page: number): Map<string, BookDestination> =>
  new Map([
    ['segnavia-front-1', { page: 1, x: 0, y: 0 }],
    ['topic', { page, x: 10, y: 20 }],
  ])

const continuousBook = (body: string, front?: string) => ({
  title: 'Book',
  mode: 'continuous' as const,
  page: { paper: 'a5' as const, margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
  ...(front === undefined ? {} : { frontMatter: [{ title: 'Preface', html: front }] }),
  chapters: [{ title: 'One', html: body }],
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

function scriptedAdapter(destinationPage: (part: 'front' | 'body', print: number) => number): BookPdfAdapter & { html: Record<'front' | 'body', string[]> } {
  const html = { front: [] as string[], body: [] as string[] }
  let frontPages = 0
  let bodyPages = 0
  return {
    html,
    print: async (source, _book, _options, part) => {
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

test('places FontSource CSS before book CSS in the printed document', async () => {
  let srcdoc = ''
  await renderBrowserBookPdf(
    {
      title: 'Book',
      mode: 'paginated',
      css: '.book-rule{color:purple}',
      page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
      chapters: [{ title: 'One', html: '<p class="book-rule">Text</p>' }],
    },
    {},
    '.font-source-marker{font-family:Held}',
    {
      render: async (setup) => {
        srcdoc = setup.html
        const document = await PDFDocument.create()
        const page = document.addPage([419.53, 595.28])
        document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'segnavia-chapter-1': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
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

describe('front print convergence', () => {
  test('is stable on the second print when destination pages match', () => {
    expect(frontPrintStatus([destinations(1), destinations(1)], ['segnavia-front-1', 'topic'], sections)).toEqual({ status: 'stable' })
  })

  test('continues after the second print and is stable on the third', () => {
    expect(frontPrintStatus([destinations(1), destinations(2)], ['segnavia-front-1', 'topic'], sections)).toEqual({ status: 'more' })
    expect(frontPrintStatus([destinations(1), destinations(2), destinations(2)], ['segnavia-front-1', 'topic'], sections)).toEqual({ status: 'stable' })
  })

  test('refuses a destination that still moves after the third print', () => {
    expect(frontPrintStatus([destinations(1), destinations(2), destinations(3)], ['segnavia-front-1', 'topic'], sections)).toEqual({
      status: 'refused',
      message: 'Front destination topic in Preface (segnavia-front-1) moved from page 2 to page 3 after three prints.',
    })
  })
})

test('allows three page-reference reprints before refusing named moving targets', () => {
  expect(pageReferencePrintStatus({ target: '9' }, { target: '10' }, 2)).toEqual({ status: 'more' })
  expect(pageReferencePrintStatus({ target: '10' }, { target: '10' }, 3)).toEqual({ status: 'stable' })
  expect(pageReferencePrintStatus({ target: '10' }, { target: '11' }, 3)).toEqual({
    status: 'refused',
    message:
      'Body page references to target did not converge after three reprints; shorten the referenced content or reserve fixed space for page references to clear this refusal.',
  })
})

test('bounds front and body alternation and names moving targets', () => {
  expect(bookPartsPrintStatus({ target: '9' }, { target: '10' }, 2)).toEqual({ status: 'more' })
  expect(bookPartsPrintStatus({ target: '10' }, { target: '10' }, 3)).toEqual({ status: 'stable' })
  expect(bookPartsPrintStatus({ target: '10' }, { target: '11' }, 3)).toEqual({
    status: 'refused',
    message:
      'Front and body page references to target did not converge after three alternations; shorten the referenced content or reserve fixed space for page references to clear this refusal.',
  })
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
    document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'segnavia-chapter-1': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
    return document.save()
  }
  let prints = 0
  let finishes = 0
  const output = await renderBookPdf(
    {
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
      chapters: [{ title: 'One', html: '<p>Text</p>' }],
    },
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

test('corrects every joined book page to the exact trim before finishing', async () => {
  const printedBookPart = async () => {
    const document = await PDFDocument.create()
    const first = document.addPage([612.96, 792.96])
    first.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    const second = document.addPage([612.96, 792.96])
    second.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'segnavia-chapter-1': [first.ref, PDFName.of('XYZ'), 0, 792.96, null] }))
    return document.save()
  }
  let finished: Uint8Array | undefined
  const output = await renderBookPdf(
    {
      title: 'Book',
      mode: 'continuous',
      page: { paper: 'letter', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
      chapters: [{ title: 'One', html: '<p>Text</p>' }],
    },
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
