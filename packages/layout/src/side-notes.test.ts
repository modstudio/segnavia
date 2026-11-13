import { expect, test } from 'bun:test'
import type { Measurements, Plan } from '@segnavia/format'
import { placeSideNotes, stackDownward } from './side-notes.ts'

test('places tiled notes once on the tile that shows their physical side', () => {
  const measurements = {
    flows: [
      {
        id: 'flow',
        kind: 'chapter',
        blocks: [],
        sideNotes: [
          { id: 'start', kind: 'block', top: 30, direction: 'ltr' },
          { id: 'end', kind: 'inline', top: 40, direction: 'ltr' },
          { id: 'untiled', kind: 'inline', top: 80, direction: 'rtl' },
        ],
      },
    ],
  } as unknown as Measurements
  const page = (start: number, end: number, side: 'left' | 'right', inlineTile?: number) => ({
    side,
    windows: [{ flow: 'flow', start, end, top: 5, column: 0, columns: 1 }],
    ...(inlineTile === undefined ? {} : { inlineTile }),
  })
  const plan = { pages: [page(0, 60, 'right', 0), page(0, 60, 'right', 1), page(0, 60, 'right', 2), page(60, 100, 'left')] } as unknown as Plan
  for (const direction of ['ltr', 'rtl'] as const) {
    const start = placeSideNotes(measurements, plan, { area: 'margin', side: 'start' }, direction)
    const end = placeSideNotes(measurements, plan, { area: 'margin', side: 'end' }, direction)
    const firstTile = direction === 'ltr' ? 0 : 2
    const lastTile = direction === 'ltr' ? 2 : 0
    expect(start[firstTile]?.notes.map((note) => note.id)).toEqual(['start', 'end'])
    expect(start.filter((held, index) => index < 3 && index !== firstTile).every((held) => held.notes.length === 0)).toBe(true)
    expect(end[lastTile]?.notes.map((note) => note.id)).toEqual(['start', 'end'])
    expect(end.filter((held, index) => index < 3 && index !== lastTile).every((held) => held.notes.length === 0)).toBe(true)
    expect(start[3]).toEqual({ page: 3, notes: [{ id: 'untiled', top: 25, column: 0, columns: 1, side: 'right' }] })
  }
})

test('stacks overlapping side notes downward with a gap', () => {
  expect(
    stackDownward(
      [
        { top: 10, height: 20 },
        { top: 15, height: 10 },
        { top: 50, height: 5 },
      ],
      4,
    ),
  ).toEqual([10, 34, 50])
})
