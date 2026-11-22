import { expect, test } from 'bun:test'
import type { Plan } from '@segnavia/format'
import { parseBookPdfOptions } from './book-options.ts'
import { RenderRefusedError } from './errors.ts'

test('turns an invalid saved plan field into a render refusal', () => {
  expect(() => parseBookPdfOptions({ plan: { version: 3 } } as never)).toThrow(RenderRefusedError)
  expect(() => parseBookPdfOptions({ plan: { version: 1 } } as never)).toThrow('version: version must be 8')
})

test('parses a saved plan structure before the document page limit is known', () => {
  const page = {
    kind: 'body',
    number: 1,
    sequence: 'body',
    flow: 'one',
    role: 'body',
    windows: [],
    notes: [],
    variables: {},
    blank: false,
    sectionOpening: false,
    parent: 'segnavia:recto',
    face: 'recto',
    side: 'right',
    fingerprint: 'page',
  } satisfies Plan['pages'][number]
  const pages = Array.from({ length: 501 }, (_, index) => ({ ...page, number: index + 1 }))
  const plan = {
    version: 8,
    fingerprint: 'saved',
    breaks: [],
    pages,
    folios: pages.map(() => '1'),
    folioPrints: pages.map(() => true),
    total: '501',
    documentFolios: pages.map(() => '1'),
    documentTotal: '501',
    recordTotals: {},
    records: {},
  } satisfies Plan

  expect(parseBookPdfOptions({ plan }).plan).toEqual(plan)
})
