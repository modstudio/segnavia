import { expect, test } from 'bun:test'
import type { Measurements, Plan } from '@segnavia/format'
import { placeSideNotes, stackDownward } from './side-notes.ts'

test('places block and inline anchors in their page windows and copies placements to tiles', () => {
  const measurements = {
    flows: [
      {
        id: 'flow',
        kind: 'chapter',
        blocks: [],
        sideNotes: [
          { id: 'block', kind: 'block', top: 30, direction: 'ltr' },
          { id: 'inline', kind: 'inline', top: 80, direction: 'rtl' },
        ],
      },
    ],
  } as unknown as Measurements
  const page = (start: number, end: number, side: 'left' | 'right', inlineTile?: number) => ({
    side,
    windows: [{ flow: 'flow', start, end, top: 5, column: 0, columns: 1 }],
    ...(inlineTile === undefined ? {} : { inlineTile }),
  })
  const plan = { pages: [page(0, 60, 'right', 0), page(0, 60, 'right', 1), page(60, 100, 'left')] } as unknown as Plan
  expect(placeSideNotes(measurements, plan, { area: 'margin', side: 'start' })).toEqual([
    { page: 0, notes: [{ id: 'block', top: 35, column: 0, columns: 1, side: 'left' }] },
    { page: 1, notes: [{ id: 'block', top: 35, column: 0, columns: 1, side: 'left' }] },
    { page: 2, notes: [{ id: 'inline', top: 25, column: 0, columns: 1, side: 'right' }] },
  ])
})

test('stacks overlapping side notes downward with a gap', () => {
  expect(stackDownward([{ top: 10, height: 20 }, { top: 15, height: 10 }, { top: 50, height: 5 }], 4)).toEqual([10, 34, 50])
})
