import { describe, expect, test } from 'bun:test'
import { LimitExceededError, resolveLimits } from './limits.ts'
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
    version: 9,
    fingerprint: 'fnv1a64:0000000000000000',
    breaks: [],
    pages: [page()],
    folios: ['1'],
    folioPrints: [true],
    numberingTotals: ['1'],
    total: '1',
    documentFolios: ['1'],
    documentTotal: '1',
    recordTotals: {},
    records: {},
  }
}

function planWithPages(count: number): PlanValue {
  const pages = Array.from({ length: count }, (_, index) => ({ ...page(), number: index + 1 }))
  return {
    ...plan(),
    pages,
    folios: pages.map((item) => String(item.number)),
    folioPrints: pages.map(() => true),
    numberingTotals: pages.map((item) => String(item.number)),
    documentFolios: pages.map((item) => String(item.number)),
  }
}

describe('Plan', () => {
  test('round-trips a valid saved plan', () => {
    const value = plan()
    expect(Plan.parse(value)).toEqual(value)
  })

  test('refuses the first invalid field with a clearing action', () => {
    expect(() => Plan.parse({ ...plan(), version: 8 })).toThrow(/version.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse(planWithPages(2), { limits: { pages: 1 } })).toThrow(/composed flow.*pages limit.*clear this refusal/)
    expect(() => Plan.parse({ ...plan(), pages: [{ ...page(), start: { flow: 'chapter', block: 0, line: -1 } }] })).toThrow(
      /pages.0.start.line.*non-negative.*clear this refusal/,
    )
    expect(() => Plan.parse({ ...plan(), pages: [{ ...page(), windows: [{ flow: 'chapter', start: 11, end: 10, top: 0, column: 0, columns: 1 }] }] })).toThrow(
      /pages.0.windows.0.end.*before its start.*clear this refusal/,
    )
    expect(() => Plan.parse({ ...plan(), folios: [] })).toThrow(/folios.*pages.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), folioPrints: [] })).toThrow(/folioPrints.*pages.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), numberingTotals: [] })).toThrow(/numberingTotals.*pages.*compute a new plan to clear this refusal/)
    expect(() => Plan.parse({ ...plan(), documentFolios: [] })).toThrow(/documentFolios.*pages.*compute a new plan to clear this refusal/)
  })

  test('checks saved pages against their resolved limit and its source', () => {
    const value = planWithPages(510)
    expect(Plan.parse(value, { limits: resolveLimits({ pages: 1000 }, undefined) })).toEqual(value)
    try {
      Plan.parse(value, { limits: resolveLimits({ pages: 1000 }, { pages: 400 }) })
      throw new Error('expected the plan to exceed the host page limit')
    } catch (error) {
      expect(error).toBeInstanceOf(LimitExceededError)
      expect(error).toMatchObject({ exceeded: [{ measure: 'pages', actual: 510, limit: 400 }] })
      expect((error as Error).message).toContain("raise the host's limits.pages")
    }
    expect(() => Plan.parse(value, { limits: resolveLimits(undefined, undefined) })).toThrow('declare a higher limits.pages on the document')
  })

  test('safeParse applies the same page bound as parse', () => {
    const value = planWithPages(501)
    expect(Plan.safeParse(value)).toMatchObject({ success: false, error: { exceeded: [{ measure: 'pages', actual: 501, limit: 500 }] } })
    expect(Plan.safeParse(value, { limits: { pages: 1000 } })).toEqual({ success: true, data: value })
    expect(Plan.safeParse({ ...value, folios: [] })).toMatchObject({ success: false })
  })

  test('checks structure without applying the default page bound', () => {
    const value = planWithPages(510)
    expect(Plan.parseStructure(value)).toEqual(value)
    expect(() => Plan.parseStructure({ ...value, folios: [] })).toThrow(/folios.*pages.*compute a new plan to clear this refusal/)
  })
})
