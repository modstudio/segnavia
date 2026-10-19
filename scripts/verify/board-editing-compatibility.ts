import type { Locator } from 'playwright-core'
import type { Harness } from './harness.ts'

interface SelectionBoardElement extends HTMLElement {
  selection: readonly string[]
  selected: string | null
}

interface SelectionItem {
  id: string
}

export async function checkBoardSelectionCompatibility(h: Harness, board: Locator, second: Locator, reset: () => Promise<void>) {
  await reset()
  const compatibility = await board.evaluate((element) => {
    const value = element as SelectionBoardElement
    let detail: { items: SelectionItem[]; item: SelectionItem | null } | undefined
    element.addEventListener('segnavia-board-selection', (event) => (detail = (event as CustomEvent).detail), { once: true })
    value.selected = 'deck-small'
    return { selection: value.selection, selected: value.selected, items: detail?.items.map((item) => item.id), item: detail?.item?.id }
  })
  h.check(
    'selected is a single-item selection view and its event carries items and item',
    compatibility.selection.join() === 'deck-small' &&
      compatibility.selected === 'deck-small' &&
      compatibility.items?.join() === 'deck-small' &&
      compatibility.item === 'deck-small',
    JSON.stringify(compatibility),
  )
  await second.click({ modifiers: ['Shift'] })
  const selectedView = await board.evaluate((element) => (element as SelectionBoardElement).selected)
  h.check('selected remains the first item after shift-click adds another', selectedView === 'deck-small', String(selectedView))
}
