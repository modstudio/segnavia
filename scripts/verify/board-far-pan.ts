import { type BoardItem, type BoardView, boardToScreen } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

interface FarPanFacts {
  item?: BoardItem
  mounted: boolean
  view: BoardView
  width: number
}

type FarPanBoard = HTMLElement & { board: { items: BoardItem[] }; view: BoardView }

// A wheel event only proves the board pans in the wheel's direction: Chromium may scale a synthetic wheel's delta, so its
// size says nothing about the board. The far item is then brought to the centre through the view, and must mount.
export async function checkFarBoardPan(h: Harness) {
  const board = h.page.locator('segnavia-board')
  const readFacts = () =>
    board.evaluate((element) => {
      const value = element as FarPanBoard
      return {
        item: value.board.items.find((item) => item.id === 'deck-far'),
        mounted: Boolean(value.shadowRoot?.querySelector('[data-board-item="deck-far"]')),
        view: value.view,
        width: value.clientWidth,
      } satisfies FarPanFacts
    })

  const before = await readFacts()
  const box = await board.boundingBox()
  if (box) await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.page.mouse.wheel(120, 0)
  await h.page.waitForFunction((x) => (document.querySelector('segnavia-board') as FarPanBoard | null)?.view.pan.x !== x, before.view.pan.x, {
    timeout: BOUNDED_WAIT_MS,
  })
  const wheeled = await readFacts()
  h.check(
    'a wheel to the right pans the board left',
    wheeled.view.pan.x < before.view.pan.x,
    JSON.stringify({ before: before.view.pan, after: wheeled.view.pan }),
  )

  await h.page
    .waitForFunction(
      () => Boolean((document.querySelector('segnavia-board') as FarPanBoard | null)?.board?.items.some((item) => item.id === 'deck-far')),
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => undefined)
  const target = await readFacts()
  if (target.item) {
    const shift = target.width / 2 - boardToScreen(target.view, target.item).x
    await board.evaluate((element, x) => {
      const value = element as FarPanBoard
      value.view = { ...value.view, pan: { ...value.view.pan, x: value.view.pan.x + x } }
    }, shift)
  }
  const mounted = await h.page
    .waitForFunction(() => Boolean(document.querySelector('segnavia-board')?.shadowRoot?.querySelector('[data-board-item="deck-far"]')), undefined, {
      timeout: BOUNDED_WAIT_MS,
    })
    .then(() => true)
    .catch(() => false)
  const facts = await readFacts()
  h.check('panning to a far board item mounts it', mounted && facts.mounted, JSON.stringify(facts))
}
