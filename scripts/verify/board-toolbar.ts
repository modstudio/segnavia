import type { BoardView } from '@segnavia/format'
import type { Harness } from './harness.ts'

export async function checkBoardToolbar(h: Harness) {
  const toolbar = h.page.locator('segnavia-board-toolbar')
  const board = h.page.locator('segnavia-board')
  await board.evaluate((element) => {
    const value = element as HTMLElement & { zoomTo(zoom: number): void }
    value.zoomTo(1)
  })
  await toolbar.locator('[part~="zoom-in"]').click()
  const zoomed = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  const level = await toolbar.locator('[part~="zoom-level"]').textContent()
  h.check('the board toolbar zoom-in button changes the board and level text', zoomed === 1.25 && level?.trim() === '125%', JSON.stringify({ zoomed, level }))

  await toolbar.locator('[part~="zoom-level"]').click()
  const reset = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view.zoom)
  h.check('the board toolbar level button returns to 100%', reset === 1, String(reset))

  const expected = await board.evaluate((element) => {
    const value = element as HTMLElement & { fitAll(): void; view: BoardView }
    value.fitAll()
    return value.view
  })
  await board.evaluate((element) => {
    const value = element as HTMLElement & { zoomTo(zoom: number): void }
    value.zoomTo(2)
  })
  await toolbar.locator('[part~="fit"]').click()
  const fitted = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view)
  h.check('the board toolbar fit button matches fitAll()', JSON.stringify(fitted) === JSON.stringify(expected), JSON.stringify({ fitted, expected }))

  const shares = await toolbar.evaluate((element) => {
    let count = 0
    element.addEventListener('segnavia-board-share', () => count++)
    ;(element.shadowRoot?.querySelector('[part~="share"]') as HTMLButtonElement | null)?.click()
    return count
  })
  h.check('the board toolbar Share button emits one segnavia-board-share event', shares === 1, String(shares))
}
