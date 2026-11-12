import { describe, expect, test } from 'bun:test'
import { Plan, type Plan as PlanValue } from './plan.ts'

function page(): PlanValue['pages'][number] {
  return {
    kind: 'body',
    number: 1,
    sequence: 'body',
    flow: 'chapter',
    role: 'opener',
    windows: [{ flow: 'chapter', start: 0, end: 10, top: 0, column: 0, columns: 1 }],
    notes: [],
    variables: {},
    blank: false,
    sectionOpening: true,
    parent: 'segnavia:opener',
    face: 'recto',
    side: 'right',
    start: { flow: 'chapter', block: 0, line: 0, id: 'p-1' },
    fingerprint: 'fnv1a64:0000000000000000',
  }
}

function plan(): PlanValue {
  return {
    version: 6,
    fingerprint: 'fnv1a64:0000000000000000',
    breaks: [],
    pages: [page()],
    folios: ['1'],
    folioPrints: [true],
    total: '1',
    documentFolios: ['1'],
    documentTotal: '1',
    recordTotals: {},
    records: {},
  }
}

describe('Plan', () => {
  test('round-trips a valid saved plan', () => {
    const value = plan()
    expect(Plan.parse(value)).toEqual(value)
  })

  test('refuses the first invalid field with a clearing action', () => {
    expect(() => Plan.parse({ ...plan(), version: 3 })).toThrow(/version.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), pages: [page(), { ...page(), number: 2 }] }, { limits: { pages: 1 } })).toThrow(
      /pages.*limits.pages.*clear this refusal/,
    )
    expect(() => Plan.parse({ ...plan(), pages: [{ ...page(), start: { flow: 'chapter', block: 0, line: -1 } }] })).toThrow(
      /pages.0.start.line.*non-negative.*clear this refusal/,
    )
    expect(() => Plan.parse({ ...plan(), pages: [{ ...page(), windows: [{ flow: 'chapter', start: 11, end: 10, top: 0, column: 0, columns: 1 }] }] })).toThrow(
      /pages.0.windows.0.end.*before its start.*clear this refusal/,
    )
    expect(() => Plan.parse({ ...plan(), folios: [] })).toThrow(/folios.*pages.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), folioPrints: [] })).toThrow(/folioPrints.*pages.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), documentFolios: [] })).toThrow(/documentFolios.*pages.*compute a new plan to clear this refusal/)
  })
})
