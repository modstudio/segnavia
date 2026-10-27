import { describe, expect, test } from 'bun:test'
import type { BookSectionInfo } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { BookDestination } from './book-destinations.ts'
import { frontPrintStatus, renderBookPdf } from './book-pdf.ts'

const sections: BookSectionInfo[] = [{ id: 'segnavia-front-1', kind: 'front', title: 'Preface' }]
const destinations = (page: number): Map<string, BookDestination> =>
  new Map([
    ['segnavia-front-1', { page: 1, x: 0, y: 0 }],
    ['topic', { page, x: 10, y: 20 }],
  ])

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

test('prints a paginated book once then finishes', async () => {
  const printedBook = async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([419.53, 595.28])
    page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
    document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'segnavia-chapter-1': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
    return document.save()
  }
  let prints = 0
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
      finish: async (pdf) => pdf,
    },
  )
  expect(prints).toBe(1)
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
