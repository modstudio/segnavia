import { describe, expect, test } from 'bun:test'
import type { BookSectionInfo } from '@segnavia/html'
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

test('refuses paginated books with the continuous workflow requirement', async () => {
  const adapter = {
    print: () => Promise.reject(new Error('print should not run')),
    finish: () => Promise.reject(new Error('finish should not run')),
  }
  const result = renderBookPdf(
    {
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
      chapters: [{ title: 'One', html: '<p>Text</p>' }],
    },
    {},
    adapter,
  )
  await expect(result).rejects.toThrow('bookPdf prints continuous books; printing a paginated book is not built yet.')
})
