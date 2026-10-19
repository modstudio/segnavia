import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

export async function checkBoardEditing(h: Harness) {
  const board = h.page.locator('segnavia-board')
  await board.evaluate((element) => {
    const value = element as HTMLElement & { fitAll(): void; selection: readonly string[] }
    value.selection = []
    value.fitAll()
    const state = window as typeof window & { boardChanges: unknown[]; boardEditErrors: unknown[] }
    state.boardChanges = []
    state.boardEditErrors = []
  })

  const first = board.locator('[data-board-item="deck-small"]')
  const second = board.locator('[data-board-item="deck-hebrew"]')
  await first.click()
  await second.click({ modifiers: ['Shift'] })
  let selection = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('shift-click adds a board item to selection', selection.join() === 'deck-small,deck-hebrew', selection.join())
  await second.click({ modifiers: ['Shift'] })
  selection = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('a second shift-click removes a board item from selection', selection.join() === 'deck-small', selection.join())

  await first.focus()
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  const all = await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { items: unknown[] }; selection: readonly string[] }
    return { selected: value.selection.length, items: value.board.items.length }
  })
  h.check('Cmd or Ctrl+A selects every board item', all.selected === all.items, JSON.stringify(all))

  await first.click()
  const before = await board.evaluate(
    (element) => (element as HTMLElement & { board: { items: Array<{ id: string; x: number }> } }).board.items.find((item) => item.id === 'deck-small')?.x,
  )
  await h.page.keyboard.press('ArrowRight')
  await h.page.waitForFunction(() => ((window as typeof window & { boardChanges?: unknown[] }).boardChanges?.length ?? 0) > 0, undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  const moved = await board.evaluate(
    (element) => (element as HTMLElement & { board: { items: Array<{ id: string; x: number }> } }).board.items.find((item) => item.id === 'deck-small')?.x,
  )
  h.check('an arrow key moves a selected item by one board unit', moved === (before ?? 0) + 1, JSON.stringify({ before, moved }))

  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  const undone = await board.evaluate(
    (element) => (element as HTMLElement & { board: { items: Array<{ id: string; x: number }> } }).board.items.find((item) => item.id === 'deck-small')?.x,
  )
  h.check('board undo restores the item position', undone === before, JSON.stringify({ before, undone }))

  const panBefore = await board.evaluate((element) => (element as HTMLElement & { view: { pan: { x: number } } }).view.pan.x)
  await board.evaluate(() => (window as typeof window & { boardEditing: { detach(): void } }).boardEditing.detach())
  const box = await board.boundingBox()
  if (!box) throw new Error('The board has no box for detached panning.')
  await h.page.mouse.move(box.x + box.width - 20, box.y + box.height - 20)
  await h.page.mouse.down()
  await h.page.mouse.move(box.x + box.width - 50, box.y + box.height - 20)
  await h.page.mouse.up()
  const panAfter = await board.evaluate((element) => (element as HTMLElement & { view: { pan: { x: number } } }).view.pan.x)
  h.check('detaching board editing restores drag-to-pan', panAfter !== panBefore, JSON.stringify({ panBefore, panAfter }))
}
