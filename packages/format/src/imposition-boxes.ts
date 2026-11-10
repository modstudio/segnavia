import { gridPlacements, mirrorPlacement, type PiecePress } from './imposition.ts'
import type { Imposition } from './imposition-schema.ts'
import { type PaperBox, roundMillimeters } from './paper.ts'

export interface ImpositionSideBoxes {
  side: 'front' | 'back'
  trim: PaperBox
  bleedBox: PaperBox
}

function union(boxes: PaperBox[]): PaperBox {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return {
    x: roundMillimeters(left),
    y: roundMillimeters(top),
    width: roundMillimeters(right - left),
    height: roundMillimeters(bottom - top),
  }
}

/** Computes the trim and realized bleed bounds of each physical imposed side. */
export function impositionBoxes(imposition: Imposition, press: PiecePress = {}): ImpositionSideBoxes[] {
  const { paper, placements: frontPlacements } = gridPlacements(imposition, press)
  const build = (side: 'front' | 'back', placements: typeof frontPlacements): ImpositionSideBoxes => ({
    side,
    trim: union(placements.map(({ trim }) => trim)),
    bleedBox: union(placements.map(({ bleedBox }) => bleedBox)),
  })
  const front = build('front', frontPlacements)
  if (imposition.sides === 'one') return [front]
  return [
    front,
    build(
      'back',
      frontPlacements.map((placement) => mirrorPlacement(placement, paper, imposition.flip)),
    ),
  ]
}
