import type { BoardItem, BoardView, Size } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

// Thumbnail frames run without scripts, so their own load event is the only
// sign that a frame has finished loading. Every shadow root records the loads
// of the frames inside it, armed before the board page creates any root.
export async function recordFrameLoads(h: Harness) {
  await h.page.addInitScript(() => {
    if (window.top !== window) return
    const loadedFrames = new WeakSet<HTMLIFrameElement>()
    ;(window as typeof window & { boardLoadedFrames: WeakSet<HTMLIFrameElement> }).boardLoadedFrames = loadedFrames
    const attachShadow = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (init) {
      const root = attachShadow.call(this, init)
      root.addEventListener('load', (event) => event.target instanceof HTMLIFrameElement && loadedFrames.add(event.target), true)
      return root
    }
  })
}

export async function showTwoLiveItems(h: Harness) {
  await h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & { view: BoardView }
    board.view = { zoom: 1.25, pan: { x: 48, y: 100 }, viewport: board.view.viewport }
  })
  await h.page.waitForFunction(
    () => {
      const root = document.querySelector('segnavia-board')?.shadowRoot
      return [...(root?.querySelectorAll('segnavia-thumbnail') ?? [])].filter((thumbnail) => thumbnail.shadowRoot?.querySelector('iframe')).length >= 2
    },
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
}

export async function checkPanKeepsFrames(h: Harness) {
  await h.page.waitForFunction(
    () => {
      const loadedFrames = (window as typeof window & { boardLoadedFrames: WeakSet<HTMLIFrameElement> }).boardLoadedFrames
      return [...(document.querySelector('segnavia-board')?.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].every((thumbnail) => {
        const frame = thumbnail.shadowRoot?.querySelector('iframe')
        return !frame || loadedFrames.has(frame)
      })
    },
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  const result = await h.page.locator('segnavia-board').evaluate(async (element) => {
    const board = element as HTMLElement & { view: { zoom: number; pan: { x: number; y: number }; viewport: Size } }
    const frames = [...(board.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].flatMap((thumbnail) =>
      thumbnail.shadowRoot?.querySelector('iframe') ? [thumbnail.shadowRoot.querySelector('iframe') as HTMLIFrameElement] : [],
    )
    let loads = 0
    for (const frame of frames) frame.addEventListener('load', () => loads++)
    for (let step = 0; step < 20; step += 1) board.view = { ...board.view, pan: { ...board.view.pan, x: board.view.pan.x + 2 } }
    await new Promise((resolve) => setTimeout(resolve, 250))
    const current = [...(board.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].flatMap((thumbnail) =>
      thumbnail.shadowRoot?.querySelector('iframe') ? [thumbnail.shadowRoot.querySelector('iframe') as HTMLIFrameElement] : [],
    )
    return { loads, same: frames.length === current.length && frames.every((frame, index) => frame === current[index]), count: frames.length }
  })
  h.check('panning keeps every live board frame mounted without reloading it', result.count >= 2 && result.loads === 0 && result.same, JSON.stringify(result))
}

export async function checkBoardUpdateKeepsFrames(h: Harness) {
  const result = await h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & {
      board: { direction: 'ltr' | 'rtl'; items: BoardItem[]; labels: unknown[]; sections: unknown[] }
    }
    const frames = [...(board.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].flatMap((thumbnail) =>
      thumbnail.shadowRoot?.querySelector('iframe') ? [thumbnail.shadowRoot.querySelector('iframe') as HTMLIFrameElement] : [],
    )
    board.board = { ...board.board, items: board.board.items.map((item) => ({ ...item, x: item.x + 12 })) }
    const current = [...(board.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].flatMap((thumbnail) =>
      thumbnail.shadowRoot?.querySelector('iframe') ? [thumbnail.shadowRoot.querySelector('iframe') as HTMLIFrameElement] : [],
    )
    return { same: frames.length === current.length && frames.every((frame, index) => frame === current[index]), count: frames.length }
  })
  h.check('setting a moved board keeps every unchanged live frame', result.count >= 2 && result.same, JSON.stringify(result))
}
