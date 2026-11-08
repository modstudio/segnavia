import { describe, expect, test } from 'bun:test'
import type { BookSectionInfo } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import { bookPartsPrintStatus, frontPrintStatus, pageReferencePrintStatus } from './book-print-status.ts'

const sections: BookSectionInfo[] = [{ id: 'front-section', kind: 'front', division: 'front', title: 'Preface' }]
const destinations = (page: number): Map<string, BookDestination> =>
  new Map([
    ['front-section', { page: 1, x: 0, y: 0 }],
    ['topic', { page, x: 10, y: 20 }],
  ])

describe('front print convergence', () => {
  test('is stable on the second print when destination pages match', () => {
    expect(frontPrintStatus([destinations(1), destinations(1)], ['front-section', 'topic'], sections)).toEqual({ status: 'stable' })
  })

  test('continues after the second print and is stable on the third', () => {
    expect(frontPrintStatus([destinations(1), destinations(2)], ['front-section', 'topic'], sections)).toEqual({ status: 'more' })
    expect(frontPrintStatus([destinations(1), destinations(2), destinations(2)], ['front-section', 'topic'], sections)).toEqual({ status: 'stable' })
  })

  test('refuses a destination that still moves after the third print', () => {
    expect(frontPrintStatus([destinations(1), destinations(2), destinations(3)], ['front-section', 'topic'], sections)).toEqual({
      status: 'refused',
      message: 'Front destination topic in Preface (front-section) moved from page 2 to page 3 after three prints.',
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
