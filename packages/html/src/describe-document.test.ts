import { describe, expect, test } from 'bun:test'
import type { Plan, PlanPage } from '@segnavia/format'
import { describeDocument } from './describe-document.ts'
import { parseDocument } from './document.ts'

const document = (dir: 'ltr' | 'rtl' = 'ltr') =>
  parseDocument({
    type: 'document',
    id: 'book',
    kind: 'book',
    metadata: { title: 'Book' },
    mode: 'continuous',
    settings: { dir, ...(dir === 'rtl' ? { lang: 'he' } : {}) },
    children: [],
  })

function page(number: number, face: PlanPage['face'], side: PlanPage['side'], start?: PlanPage['start']): PlanPage {
  return {
    kind: 'body',
    number,
    sequence: 'body',
    flow: 'main',
    role: number === 1 ? 'opener' : 'body',
    windows: [],
    notes: [],
    variables: {},
    blank: false,
    sectionOpening: number === 1,
    parent: number === 1 ? 'segnavia:opener' : `segnavia:${face}`,
    face,
    side,
    ...(start === undefined ? {} : { start }),
    fingerprint: `fnv1a64:page-${number}`,
  }
}

const plan = (pages: PlanPage[]): Plan => ({
  version: 6,
  fingerprint: 'fnv1a64:plan',
  breaks: ['chapter-two'],
  pages,
  folios: ['א', 'ב'],
  folioPrints: [true, true],
  total: 'ב',
  documentFolios: ['א', 'ב'],
  documentTotal: 'ב',
  recordTotals: {},
  records: {},
})

describe('describeDocument saved plan', () => {
  test('describes page numbers, folios, starts, roles and faces', () => {
    const saved = plan([
      page(1, 'recto', 'right', { flow: 'main', block: 0, line: 0, id: 'chapter-one' }),
      page(2, 'verso', 'left', { flow: 'main', block: 1, line: 3 }),
    ])

    expect(describeDocument(document(), { plan: saved }).plan).toEqual({
      fingerprint: 'fnv1a64:plan',
      breaks: ['chapter-two'],
      pages: [
        { number: 1, folio: 'א', start: { flow: 'main', block: 0, line: 0, id: 'chapter-one' }, role: 'opener', face: 'recto' },
        { number: 2, folio: 'ב', start: { flow: 'main', block: 1, line: 3 }, role: 'body', face: 'verso' },
      ],
    })
  })

  test('leaves the description unchanged when no plan is supplied', () => {
    const description = describeDocument(document())
    expect(description).not.toHaveProperty('plan')
    expect(description).toEqual(describeDocument(document(), {}))
  })

  test('validates a saved plan and names the first invalid field', () => {
    const invalid = { ...plan([page(1, 'recto', 'right')]), pages: [{ ...page(1, 'recto', 'right'), face: 'top' }] }
    expect(() => describeDocument(document(), { plan: invalid as Plan })).toThrow('pages.0.face')
  })
})

test('includes a supplied preflight report unchanged and otherwise omits the section', () => {
  const preflight = {
    status: 'warnings' as const,
    issues: [
      {
        id: 'region-overset:body',
        check: 'region-overset' as const,
        severity: 'warning' as const,
        subject: 'body',
        message: 'Shorten body.',
      },
    ],
    omitted: {},
    facts: { pageCount: 1, pages: [{ folio: '1' }], fits: [] },
    coverage: { measured: 1, total: 1 },
  }
  expect(describeDocument(document(), { preflight }).preflight).toBe(preflight)
  expect(describeDocument(document())).not.toHaveProperty('preflight')
})

test('describes fitted and measured properties from supplied measurements', () => {
  const measurements = {
    fits: [{ id: 'heading', values: [{ strategy: 'size' as const, value: 18, unit: 'px' }] }],
    properties: [{ id: 'words', name: '--widest', kind: 'max-content-inline:children' as const, value: 84.25, unit: 'px' as const }],
    variables: [],
    flows: [],
    notes: [],
    geometry: { notesGap: 0 },
    parents: {},
    settings: { rectoOpenings: false, direction: 'ltr' as const, endnotePlacement: 'book' as const },
  }
  expect(describeDocument(document(), { measurements }).measured).toEqual({
    fits: measurements.fits,
    properties: measurements.properties,
  })
  expect(describeDocument(document())).not.toHaveProperty('measured')
})
