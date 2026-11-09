import { sheetMm } from './paper.ts'
import type { Print } from './print.ts'

type PiecePaper = Pick<Print, 'paper' | 'orientation'>

export function mixedImpositionGeometryRefusal(pieces: readonly { print?: PiecePaper }[]): string | undefined {
  const geometries = pieces.flatMap((piece, index) => (piece.print ? [{ index, paper: sheetMm(piece.print) }] : []))
  const first = geometries[0]
  if (!first) return undefined
  const different = geometries.find(({ paper }) => paper.width !== first.paper.width || paper.height !== first.paper.height)
  if (!different) return undefined
  const label = (entry: (typeof geometries)[number]) => `page ${entry.index + 1} geometry ${entry.paper.width}mm by ${entry.paper.height}mm`
  return `${label(first)} and ${label(different)} cannot share one imposition; use the same page geometry, or print without imposition, to clear this refusal.`
}
