import type { Locator, Page } from 'playwright-core'
import { center, drag } from './board-editing-actions.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

interface ResetBoardElement extends HTMLElement {
  board: { items: Array<{ id: string }> } | null
}

interface ResetWindow {
  boardChanges: Array<{ edit: { kind: string; ids?: string[] } }>
  hostBoard: { items: Array<{ id: string }> }
  boardEditing: { add(input: { kind: string; address: string }): string | undefined }
}

// A host that clears the board while a write is in flight must not let a later edit reuse that write's id. The page
// reloads so the in-flight move is the editing session's first edit, the id a reset queue would hand out again.
export async function checkBoardEditingReset(h: Harness, page: Page, board: Locator, first: Locator) {
  await page.reload()
  await page.waitForFunction(() => Boolean((window as unknown as Partial<ResetWindow>).boardEditing), undefined, { timeout: BOUNDED_WAIT_MS })
  await first.waitFor({ state: 'visible', timeout: BOUNDED_WAIT_MS })
  await first.click()
  await drag(page, await center(first), 30, 0)
  const added = await board.evaluate((element) => {
    const value = element as ResetBoardElement
    const current = value.board
    value.board = null
    value.board = current
    return (window as unknown as ResetWindow).boardEditing.add({ kind: 'deck', address: 'reset-added-deck' })
  })
  const sent = await page
    .waitForFunction(
      (id) => (window as unknown as ResetWindow).boardChanges.some((change) => change.edit.kind === 'add' && change.edit.ids?.includes(id as string)),
      added,
      {
        timeout: BOUNDED_WAIT_MS,
      },
    )
    .then(() => true)
    .catch(() => false)
  const state = await board.evaluate((element, id) => {
    const value = element as ResetBoardElement
    const host = (window as unknown as ResetWindow).hostBoard
    return {
      sent: (window as unknown as ResetWindow).boardChanges.map((change) => change.edit.kind),
      onScreen: Boolean(value.board?.items.some((item) => item.id === id)),
      stored: host.items.some((item) => item.id === id),
    }
  }, added)
  h.check('an edit after a board reset during a write is still sent to the host', sent && state.onScreen && state.stored, JSON.stringify({ added, ...state }))
}
