import { type BoardItem, type BoardView, boardToScreen } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

interface FarPanFacts {
  item?: BoardItem
  mounted: boolean
  view: BoardView
  width: number
}

export async function checkFarBoardPan(h: Harness) {
  const board = h.page.locator('segnavia-board')
  const readFacts = () =>
    board.evaluate((element) => {
      const value = element as HTMLElement & { board: { items: BoardItem[] }; view: BoardView }
      return {
        item: value.board.items.find((item) => item.id === 'deck-far'),
        mounted: Boolean(value.shadowRoot?.querySelector('[data-board-item="deck-far"]')),
        view: value.view,
        width: value.clientWidth,
      } satisfies FarPanFacts
    })

  let facts = await readFacts()
  const deadline = Date.now() + BOUNDED_WAIT_MS
  while (!facts.mounted && Date.now() < deadline) {
    const box = await board.boundingBox()
    if (box) await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    if (facts.item) await h.page.mouse.wheel(boardToScreen(facts.view, facts.item).x - facts.width / 2, 0)
    facts = await readFacts()
    if (!facts.mounted) await h.page.waitForTimeout(16)
  }
  h.check('panning to a far board item mounts it', facts.mounted, JSON.stringify(facts))
}
