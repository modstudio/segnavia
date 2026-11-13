import { expect, test } from 'bun:test'
import type { Measurements, Plan } from '@segnavia/format'
import { placeSideNotes, stackDownward } from './side-notes.ts'

test('places side notes on the page containing their anchor', () => {
  const measurements = {
    flows: [
      {
        id: 'flow',
        kind: 'chapter',
        blocks: [],
        sideNotes: [
          { id: 'start', kind: 'block', top: 30, direction: 'ltr' },
          { id: 'end', kind: 'inline', top: 40, direction: 'ltr' },
          { id: 'second', kind: 'inline', top: 80, direction: 'rtl' },
        ],
      },
    ],
  } as unknown as Measurements
  const page = (start: number, end: number, side: 'left' | 'right') => ({
    side,
    windows: [{ flow: 'flow', start, end, top: 5, column: 0, columns: 1 }],
  })
  const plan = { pages: [page(0, 60, 'right'), page(60, 100, 'left')] } as unknown as Plan
  const placed = placeSideNotes(measurements, plan, { area: 'margin', side: 'start' })
  expect(placed[0]?.notes.map((note) => note.id)).toEqual(['start', 'end'])
  expect(placed[1]).toEqual({ page: 1, notes: [{ id: 'second', top: 25, column: 0, columns: 1, side: 'right' }] })
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
