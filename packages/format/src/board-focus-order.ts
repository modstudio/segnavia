import type { Board, BoardLabel } from './board.ts'
import { type BoardShapes, labelRectangle } from './board-geometry.ts'
import { boardSectionGroups } from './board-listing.ts'

function labelsInReadingOrder(labels: BoardLabel[], board: Board): BoardLabel[] {
  const inline = board.direction === 'rtl' ? -1 : 1
  return [...labels].sort((a, b) => a.y - b.y || inline * (a.x - b.x))
}

/** The board entities reached by Tab, in the same section and reading order as the board list. */
export function boardFocusOrder(board: Board, shapes: BoardShapes): string[] {
  const claimedLabels = new Set<string>()
  return boardSectionGroups(board).flatMap((group) => {
    if (group.kind === 'loose') {
      const labels = labelsInReadingOrder(
        board.labels.filter((label) => !claimedLabels.has(label.id)),
        board,
      )
      return [...group.items.map((item) => item.id), ...labels.map((label) => label.id)]
    }
    const section = group.section
    const labels = board.labels.filter((label) => {
      if (claimedLabels.has(label.id)) return false
      const box = labelRectangle(label, shapes)
      const region = section.rectangle
      const contained = box.x >= region.x && box.y >= region.y && box.x + box.width <= region.x + region.width && box.y + box.height <= region.y + region.height
      if (contained) claimedLabels.add(label.id)
      return contained
    })
    return [section.id, ...group.items.map((item) => item.id), ...labelsInReadingOrder(labels, board).map((label) => label.id)]
  })
}
