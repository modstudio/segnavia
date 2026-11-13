import { describe, expect, test } from 'bun:test'
import type { Measurements, Plan } from '@segnavia/format'
import { numberLines, resolveLineNumberSide } from './line-numbers.ts'

function fixtures() {
  const blocks = [
    {
      kind: 'heading' as const,
      tag: 'h2',
      position: { chapter: 0, block: 0 },
      lines: [{ top: 0, bottom: 10 }],
      numbered: true as const,
      direction: 'ltr' as const,
    },
    {
      kind: 'text' as const,
      tag: 'p',
      position: { chapter: 0, block: 1 },
      lines: Array.from({ length: 15 }, (_, index) => ({ top: index * 10 + 10, bottom: index * 10 + 20 })),
      numbered: true as const,
      direction: 'ltr' as const,
    },
  ]
  const measurements = {
    fits: [],
    properties: [],
    variables: [],
    notes: [],
    parents: {},
    geometry: { notesGap: 0 },
    settings: { rectoOpenings: false, direction: 'ltr' as const, endnotePlacement: 'book' as const },
    flows: [{ id: 'one', kind: 'chapter' as const, blocks }],
  } as Measurements
  const page = (start: number, end: number, top: number, sectionOpening: boolean) => ({
    kind: 'body' as const,
    number: 1,
    sequence: 'body' as const,
    flow: 'one',
    role: 'body' as const,
    windows: [{ flow: 'one', start, end, top, column: 0, columns: 1 }],
    notes: [],
    blank: false,
    sectionOpening,
    variables: {},
    parent: 'body',
    face: 'recto' as const,
    side: 'right' as const,
    fingerprint: '',
  })
  const plan = {
    version: 7,
    fingerprint: '',
    breaks: [],
    pages: [page(0, 80, 0, true), page(80, 170, 0, false)],
    folios: ['1', '2'],
    folioPrints: [true, true],
    total: '2',
    documentFolios: ['1', '2'],
    documentTotal: '2',
    recordTotals: {},
    records: {},
  } as Plan
  return { measurements, plan }
}

describe('numberLines', () => {
  test('counts text lines across page windows and formats only interval values', () => {
    const { measurements, plan } = fixtures()
    expect(numberLines(measurements, plan, { interval: 5, start: 1, restart: 'section', area: 'text', side: 'outer', system: 'hebrew' })).toEqual([
      { page: 0, lines: [{ value: 5, label: 'ה', top: 50, height: 10, column: 0, columns: 1, side: 'right' }] },
      {
        page: 1,
        lines: [
          { value: 10, label: 'י', top: 20, height: 10, column: 0, columns: 1, side: 'right' },
          { value: 15, label: 'טו', top: 70, height: 10, column: 0, columns: 1, side: 'right' },
        ],
      },
    ])
  })

  test('restarts page counters while never continues across flows', () => {
    const { measurements, plan } = fixtures()
    expect(numberLines(measurements, plan, { interval: 1, start: 3, restart: 'page', area: 'text', side: 'start', system: 'arabic' })[1]?.lines[0]?.value).toBe(
      3,
    )
    const flow = measurements.flows[0]
    if (!flow || !('blocks' in flow)) throw new Error('The fixture flow has no blocks.')
    flow.blocks.push({
      kind: 'text',
      tag: 'p',
      position: { chapter: 1, block: 0 },
      lines: [{ top: 170, bottom: 180 }],
      numbered: true,
      direction: 'ltr',
    })
    measurements.flows.push({
      id: 'two',
      kind: 'chapter',
      blocks: [{ kind: 'text', tag: 'p', position: { chapter: 2, block: 0 }, lines: [{ top: 0, bottom: 10 }], numbered: true, direction: 'ltr' }],
    })
    plan.pages.push({
      ...plan.pages[1],
      flow: 'two',
      windows: [
        { flow: 'one', start: 170, end: 180, top: 0, column: 0, columns: 1 },
        { flow: 'two', start: 0, end: 10, top: 10, column: 0, columns: 1 },
      ],
    } as Plan['pages'][number])
    expect(
      numberLines(measurements, plan, { interval: 1, start: 3, restart: 'never', area: 'text', side: 'start', system: 'arabic' }).map((page) =>
        page.lines.map((line) => line.value),
      ),
    ).toEqual([
      [3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17],
      [18, 19],
    ])
  })

  test('restarts a section counter when the chapter changes within one flow', () => {
    const { measurements, plan } = fixtures()
    const flow = measurements.flows[0]
    if (!flow || !('blocks' in flow)) throw new Error('The fixture flow has no blocks.')
    flow.blocks.push({
      kind: 'text',
      tag: 'p',
      position: { chapter: 1, block: 0 },
      lines: [{ top: 160, bottom: 170 }],
      numbered: true,
      direction: 'ltr',
    })
    plan.pages = [
      {
        ...plan.pages[0],
        windows: [{ flow: 'one', start: 0, end: 180, top: 0, column: 0, columns: 1 }],
      } as Plan['pages'][number],
    ]

    const lines = numberLines(measurements, plan, { interval: 1, start: 3, restart: 'section', area: 'text', side: 'outer', system: 'arabic' })[0]?.lines
    expect(lines?.at(-1)?.value).toBe(3)
  })
})

test('resolves physical and directional sides', () => {
  expect(resolveLineNumberSide('outer', { side: 'left' }, 'ltr')).toBe('left')
  expect(resolveLineNumberSide('inner', { side: 'left' }, 'ltr')).toBe('right')
  expect(resolveLineNumberSide('start', { side: 'left' }, 'rtl')).toBe('right')
  expect(resolveLineNumberSide('end', { side: 'right' }, 'rtl')).toBe('left')
})
