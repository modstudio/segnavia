import { gridPlacements, mirrorPlacement, type PiecePress } from './imposition.ts'
import type { Imposition } from './imposition-schema.ts'
import { type PaperBox, unionBoxes } from './paper.ts'

export interface ImpositionSideBoxes {
  side: 'front' | 'back'
  trim: PaperBox
  bleedBox: PaperBox
}

/** Computes the trim and realized bleed bounds of each physical imposed side. */
export function impositionBoxes(imposition: Imposition, press: PiecePress = {}): ImpositionSideBoxes[] {
  const { paper, placements: frontPlacements } = gridPlacements(imposition, press)
  const build = (side: 'front' | 'back', placements: typeof frontPlacements): ImpositionSideBoxes => ({
    side,
    trim: unionBoxes(placements.map(({ trim }) => trim)),
    bleedBox: unionBoxes(placements.map(({ bleedBox }) => bleedBox)),
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
