import { describe, expect, test } from 'bun:test'
import { type BookSectionInfo, bookDocument, parseBookFixture } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import { bookPartsPrintStatus, finalNumbers, frontPrintStatus, pageReferencePrintStatus } from './book-print-status.ts'
import { RenderRefusedError } from './errors.ts'

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

test('leaves an unprinted heading number empty and refuses an explicit page reference', () => {
  const sources = [
    { destinations: new Map([['preface', { page: 1, x: 0, y: 0 }]]), system: 'arabic' as const, printed: false, division: 'frontMatter' as const },
  ]
  expect(finalNumbers(['preface'], sources, new Set(['preface']))).toEqual({ preface: '' })
  expect(() => finalNumbers(['preface'], sources)).toThrow(RenderRefusedError)
  expect(() => finalNumbers(['preface'], sources)).toThrow(/numbering\.printed\.frontMatter/)
})

test('distinguishes a generated contents number from an authored reference on unprinted front matter', () => {
  const document = bookDocument(
    parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      numbering: { printed: { frontMatter: false } },
      frontMatter: [
        { title: 'Preface', html: '<p id="front-target">Front</p>' },
        { kind: 'contents', title: 'Contents' },
      ],
      chapters: [{ title: 'One', html: '<p>See <a href="#front-target" data-ref="page"></a></p>' }],
    }),
  )
  const preface = document.headings.find((heading) => heading.text === 'Preface')
  expect(preface).toBeDefined()
  expect(document.pageReferenceTargets).toEqual(['front-target'])
  const source = {
    destinations: new Map([
      [preface?.id ?? '', { page: 1, x: 0, y: 0 }],
      ['front-target', { page: 1, x: 0, y: 0 }],
    ]),
    system: 'roman-lower' as const,
    printed: false,
    division: 'frontMatter' as const,
  }
  expect(finalNumbers([preface?.id ?? ''], [source], new Set([preface?.id ?? '']))).toEqual({ [preface?.id ?? '']: '' })
  expect(() => finalNumbers(document.pageReferenceTargets, [source], new Set(), new Set(document.pageReferenceTargets))).toThrow(
    /numbering\.printed\.frontMatter/,
  )
})
