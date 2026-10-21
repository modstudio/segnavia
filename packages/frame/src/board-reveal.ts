import { type Board, type BoardItem, itemHeight } from '@segnavia/format'

export interface RevealTarget {
  item?: BoardItem
  bounds: { x: number; y: number; width: number; height: number }
}

/** The board-space box a reveal brings into view: a section's rectangle, or an item at its resolved height. */
export function revealTarget(board: Board, shapes: Record<string, { width: number; height: number }>, id: string): RevealTarget | undefined {
  const item = board.items.find((entry) => entry.id === id)
  const section = board.sections.find((entry) => entry.id === id)
  if (section) return { bounds: section.rectangle }
  if (!item) return undefined
  return { item, bounds: { x: item.x, y: item.y, width: item.width, height: itemHeight(item, shapes[item.id] as { width: number; height: number }) } }
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
