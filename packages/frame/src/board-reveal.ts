import { type Board, type BoardItem, type BoardShapes, itemHeight, labelRectangle } from '@segnavia/format'

type RevealBounds = { x: number; y: number; width: number; height: number }
export type RevealTarget =
  | { kind: 'item'; item: BoardItem; bounds: RevealBounds }
  | { kind: 'label'; bounds: RevealBounds }
  | { kind: 'section'; bounds: RevealBounds }

/** A section rectangle, label rectangle or item box at its resolved height brought into view. */
export function revealTarget(board: Board, shapes: BoardShapes, id: string): RevealTarget | undefined {
  const item = board.items.find((entry) => entry.id === id)
  const label = board.labels.find((entry) => entry.id === id)
  const section = board.sections.find((entry) => entry.id === id)
  if (section) return { kind: 'section', bounds: section.rectangle }
  if (label) return { kind: 'label', bounds: labelRectangle(label, shapes) }
  if (!item) return undefined
  return {
    kind: 'item',
    item,
    bounds: { x: item.x, y: item.y, width: item.width, height: itemHeight(item, shapes.items[item.id] as { width: number; height: number }) },
  }
}

// A reveal the user asked for moves focus to the item a frame later, unless focus
// moved in that frame. A later refit, once the item's real size is known, only
// adjusts the view: focus may be elsewhere by then, where a Delete would remove the item.
export function focusAfterReveal(focus: () => void): void {
  const activeAtReveal = deepActiveElement()
  requestAnimationFrame(() => {
    if (deepActiveElement() === activeAtReveal) focus()
  })
}

function deepActiveElement(): Element | null {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}
