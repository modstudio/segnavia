import { impose, type Placement } from './imposition.ts'
import type { Imposition } from './index.ts'
import { MARK_GAP_MM, MARK_LENGTH_MM, type MarkSegment, roundMillimeters } from './paper.ts'

export const MIN_MARK_LENGTH_MM = 2
export type ImpositionMarkEdge = 'top' | 'right' | 'bottom' | 'left'

export interface OmittedImpositionMark {
  side: 'front' | 'back'
  edge: ImpositionMarkEdge
  cutPosition: number
}

export interface ImpositionSideMarks {
  side: 'front' | 'back'
  marks: MarkSegment[]
  omittedMarks: OmittedImpositionMark[]
}

const unique = (values: number[]) => [...new Set(values.map(roundMillimeters))].sort((a, b) => a - b)

function addMark(
  result: ImpositionSideMarks,
  edge: ImpositionMarkEdge,
  cutPosition: number,
  start: number,
  available: number,
  horizontal: boolean,
  direction: -1 | 1,
): void {
  const length = Math.min(MARK_LENGTH_MM, roundMillimeters(available))
  if (length < MIN_MARK_LENGTH_MM) {
    result.omittedMarks.push({ side: result.side, edge, cutPosition })
    return
  }
  const end = roundMillimeters(start + direction * length)
  result.marks.push(
    horizontal
      ? { x1: Math.min(start, end), y1: cutPosition, x2: Math.max(start, end), y2: cutPosition }
      : { x1: cutPosition, y1: Math.min(start, end), x2: cutPosition, y2: Math.max(start, end) },
  )
}

function outerMarks(side: ImpositionSideMarks, placements: Placement[], paper: { width: number; height: number }): void {
  const verticalCuts = unique(placements.flatMap(({ trim }) => [trim.x, trim.x + trim.width]))
  const horizontalCuts = unique(placements.flatMap(({ trim }) => [trim.y, trim.y + trim.height]))
  const top = Math.min(...placements.map(({ bleedBox }) => bleedBox.y))
  const right = Math.max(...placements.map(({ bleedBox }) => bleedBox.x + bleedBox.width))
  const bottom = Math.max(...placements.map(({ bleedBox }) => bleedBox.y + bleedBox.height))
  const left = Math.min(...placements.map(({ bleedBox }) => bleedBox.x))
  for (const cut of verticalCuts) {
    addMark(side, 'top', cut, roundMillimeters(top - MARK_GAP_MM), top - MARK_GAP_MM, false, -1)
    addMark(side, 'bottom', cut, roundMillimeters(bottom + MARK_GAP_MM), paper.height - bottom - MARK_GAP_MM, false, 1)
  }
  for (const cut of horizontalCuts) {
    addMark(side, 'left', cut, roundMillimeters(left - MARK_GAP_MM), left - MARK_GAP_MM, true, -1)
    addMark(side, 'right', cut, roundMillimeters(right + MARK_GAP_MM), paper.width - right - MARK_GAP_MM, true, 1)
  }
}

function intersectsBleed(mark: MarkSegment, boxes: Placement['bleedBox'][]): boolean {
  return boxes.some(
    (box) => Math.max(mark.x1, box.x) <= Math.min(mark.x2, box.x + box.width) && Math.max(mark.y1, box.y) <= Math.min(mark.y2, box.y + box.height),
  )
}

function rayRoom(start: number, cut: number, horizontal: boolean, direction: -1 | 1, boxes: Placement['bleedBox'][]): number {
  const obstacles = boxes
    .filter((box) => {
      const acrossStart = horizontal ? box.y : box.x
      const acrossEnd = acrossStart + (horizontal ? box.height : box.width)
      if (cut < acrossStart || cut > acrossEnd) return false
      const alongStart = horizontal ? box.x : box.y
      const alongEnd = alongStart + (horizontal ? box.width : box.height)
      return direction < 0 ? alongEnd <= start : alongStart >= start
    })
    .map((box) => {
      const alongStart = horizontal ? box.x : box.y
      const alongEnd = alongStart + (horizontal ? box.width : box.height)
      return direction < 0 ? start - alongEnd - MARK_GAP_MM : alongStart - start - MARK_GAP_MM
    })
  return Math.max(0, Math.min(MARK_LENGTH_MM, ...obstacles))
}

function cornerMarks(side: ImpositionSideMarks, placements: Placement[], rows: number): void {
  const boxes = placements.map(({ bleedBox }) => bleedBox)
  const left = Math.min(...placements.map(({ trim }) => trim.x))
  const right = Math.max(...placements.map(({ trim }) => trim.x + trim.width))
  for (const placement of placements) {
    const { trim, bleedBox, row } = placement
    const candidates: Array<[ImpositionMarkEdge, number, number, boolean, -1 | 1]> = []
    if (row > 0) {
      candidates.push(['top', trim.x, bleedBox.y - MARK_GAP_MM, false, -1])
      candidates.push(['top', trim.x + trim.width, bleedBox.y - MARK_GAP_MM, false, -1])
    }
    if (row < rows - 1) {
      candidates.push(['bottom', trim.x, bleedBox.y + bleedBox.height + MARK_GAP_MM, false, 1])
      candidates.push(['bottom', trim.x + trim.width, bleedBox.y + bleedBox.height + MARK_GAP_MM, false, 1])
    }
    if (trim.x > left) {
      candidates.push(['left', trim.y, bleedBox.x - MARK_GAP_MM, true, -1])
      candidates.push(['left', trim.y + trim.height, bleedBox.x - MARK_GAP_MM, true, -1])
    }
    if (trim.x + trim.width < right) {
      candidates.push(['right', trim.y, bleedBox.x + bleedBox.width + MARK_GAP_MM, true, 1])
      candidates.push(['right', trim.y + trim.height, bleedBox.x + bleedBox.width + MARK_GAP_MM, true, 1])
    }
    for (const [edge, cut, start, horizontal, direction] of candidates) {
      const before = side.marks.length
      addMark(side, edge, roundMillimeters(cut), roundMillimeters(start), rayRoom(start, cut, horizontal, direction, boxes), horizontal, direction)
      const mark = side.marks.at(-1)
      if (side.marks.length > before && mark && intersectsBleed(mark, boxes)) {
        side.marks.pop()
        side.omittedMarks.push({ side: side.side, edge, cutPosition: roundMillimeters(cut) })
      }
    }
  }
}

/** Computes physical crop-mark geometry without changing the fixed paper size. */
export function impositionMarks(imposition: Imposition): ImpositionSideMarks[] {
  if (!imposition.marks) return []
  const cellCount = imposition.columns * imposition.rows
  const frontImposed = impose({ ...imposition, sides: 'one', fill: 'sequence', skip: 0 }, cellCount)
  const frontPlacements = frontImposed.placements
  const build = (sideName: 'front' | 'back', placements: Placement[]) => {
    const side: ImpositionSideMarks = { side: sideName, marks: [], omittedMarks: [] }
    outerMarks(side, placements, frontImposed.paper)
    if (imposition.cornerMarks) cornerMarks(side, placements, imposition.rows)
    return side
  }
  const front = build('front', frontPlacements)
  if (imposition.sides === 'one') return [front]
  const portrait = frontImposed.paper.width <= frontImposed.paper.height
  const axis = (imposition.flip === 'long') === portrait ? 'x' : 'y'
  const mirrorMark = (mark: MarkSegment): MarkSegment =>
    axis === 'x'
      ? { ...mark, x1: roundMillimeters(frontImposed.paper.width - mark.x1), x2: roundMillimeters(frontImposed.paper.width - mark.x2) }
      : { ...mark, y1: roundMillimeters(frontImposed.paper.height - mark.y1), y2: roundMillimeters(frontImposed.paper.height - mark.y2) }
  const mirrorEdge = (edge: ImpositionMarkEdge): ImpositionMarkEdge => {
    if (axis === 'x') return edge === 'left' ? 'right' : edge === 'right' ? 'left' : edge
    return edge === 'top' ? 'bottom' : edge === 'bottom' ? 'top' : edge
  }
  const back: ImpositionSideMarks = {
    side: 'back',
    marks: front.marks.map(mirrorMark),
    omittedMarks: front.omittedMarks.map(({ edge, cutPosition }) => ({
      side: 'back',
      edge: mirrorEdge(edge),
      cutPosition: roundMillimeters(
        axis === 'x' && (edge === 'top' || edge === 'bottom')
          ? frontImposed.paper.width - cutPosition
          : axis === 'y' && (edge === 'left' || edge === 'right')
            ? frontImposed.paper.height - cutPosition
            : cutPosition,
      ),
    })),
  }
  return [front, back]
}
