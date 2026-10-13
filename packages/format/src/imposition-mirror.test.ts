import { describe, expect, test } from 'bun:test'
import { mirrorPlacement, type Placement } from './index.ts'

const front: Placement = {
  page: 0,
  paper: 0,
  side: 'front',
  column: 0,
  row: 0,
  trim: { x: 10, y: 20, width: 30, height: 40 },
  bleed: { top: 1, right: 2, bottom: 3, left: 4 },
  bleedBox: { x: 5, y: 18, width: 38, height: 46 },
  safeBox: { x: 14, y: 26, width: 22, height: 28 },
  clipped: ['top', 'right'],
}

describe('mirrorPlacement', () => {
  test.each([
    [
      'portrait long',
      { width: 100, height: 200 },
      'long',
      { x: 60, y: 20 },
      { top: 1, right: 4, bottom: 3, left: 2 },
      ['top', 'left'],
      { x: 57, y: 18 },
      { x: 64, y: 26 },
    ],
    [
      'portrait short',
      { width: 100, height: 200 },
      'short',
      { x: 10, y: 140 },
      { top: 3, right: 2, bottom: 1, left: 4 },
      ['right', 'bottom'],
      { x: 5, y: 136 },
      { x: 14, y: 146 },
    ],
    [
      'landscape long',
      { width: 200, height: 100 },
      'long',
      { x: 10, y: 40 },
      { top: 3, right: 2, bottom: 1, left: 4 },
      ['right', 'bottom'],
      { x: 5, y: 36 },
      { x: 14, y: 46 },
    ],
    [
      'landscape short',
      { width: 200, height: 100 },
      'short',
      { x: 160, y: 20 },
      { top: 1, right: 4, bottom: 3, left: 2 },
      ['top', 'left'],
      { x: 157, y: 18 },
      { x: 164, y: 26 },
    ],
  ] as const)('mirrors a %s placement and its edge metadata', (_, paper, flip, position, bleed, clipped, bleedPosition, safePosition) => {
    const mirrored = mirrorPlacement(front, paper, flip, 9)
    expect(mirrored).toMatchObject({ page: 9, side: 'back', trim: { ...position, width: 30, height: 40 }, bleed, clipped })
    expect(mirrored.bleedBox).toEqual({ ...bleedPosition, width: 38, height: 46 })
    expect(mirrored.safeBox).toEqual({ ...safePosition, width: 22, height: 28 })
  })
})
