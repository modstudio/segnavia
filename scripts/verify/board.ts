import { type BoardItem, type BoardView, boardToScreen, itemHeight, type Size } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

interface MountedBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

const shapes: Record<string, Size> = {
  'deck-small': { width: 1280, height: 720 },
  'deck-hebrew': { width: 1280, height: 720 },
  page: { width: 640, height: 900 },
  paper: { width: 816, height: 1056 },
  image: { width: 1280, height: 720 },
  shot: { width: 1280, height: 720 },
  'deck-far': { width: 1280, height: 720 },
}

async function placementFacts(h: Harness) {
  return h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & { board: { items: BoardItem[] }; view: unknown }
    const host = board.getBoundingClientRect()
    const boxes: MountedBox[] = [...(board.shadowRoot?.querySelectorAll<HTMLElement>('[data-board-item]') ?? [])].map((item) => {
      const box = item.getBoundingClientRect()
      return { id: item.dataset.boardItem ?? '', x: box.x - host.x, y: box.y - host.y, width: box.width, height: box.height }
    })
    return { board: board.board, view: board.view, boxes }
  })
}

async function checkPlacement(h: Harness, moment: string) {
  const facts = await placementFacts(h)
  const mismatches = facts.boxes.flatMap((box) => {
    const item = facts.board.items.find((entry) => entry.id === box.id)
    const shape = shapes[box.id]
    if (!item || !shape) return [`${box.id}: missing data`]
    const point = boardToScreen(facts.view as Parameters<typeof boardToScreen>[0], item)
    const expected = {
      x: point.x,
      y: point.y,
      width: item.width * (facts.view as { zoom: number }).zoom,
      height: itemHeight(item, shape) * (facts.view as { zoom: number }).zoom,
    }
    return Math.max(Math.abs(box.x - expected.x), Math.abs(box.y - expected.y), Math.abs(box.width - expected.width), Math.abs(box.height - expected.height)) <=
      1
      ? []
      : [`${box.id}: ${JSON.stringify({ box, expected })}`]
  })
  h.check(`board item boxes match boardToScreen ${moment}`, mismatches.length === 0, mismatches.join('; '))
}

async function showTwoLiveItems(h: Harness) {
  await h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & { view: BoardView }
    board.view = { zoom: 1.25, pan: { x: 48, y: 100 }, viewport: board.view.viewport }
  })
  await h.page.waitForFunction(() => (document.querySelector('segnavia-board')?.shadowRoot?.querySelectorAll('iframe').length ?? 0) >= 2, undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
}

async function checkPanKeepsFrames(h: Harness) {
  const result = await h.page.locator('segnavia-board').evaluate(async (element) => {
    const board = element as HTMLElement & { view: { zoom: number; pan: { x: number; y: number }; viewport: Size } }
    const frames = [...(board.shadowRoot?.querySelectorAll('iframe') ?? [])]
    let loads = 0
    for (const frame of frames) frame.addEventListener('load', () => loads++)
    for (let step = 0; step < 20; step += 1) board.view = { ...board.view, pan: { ...board.view.pan, x: board.view.pan.x + 2 } }
    await new Promise((resolve) => setTimeout(resolve, 250))
    const current = [...(board.shadowRoot?.querySelectorAll('iframe') ?? [])]
    return { loads, same: frames.length === current.length && frames.every((frame, index) => frame === current[index]), count: frames.length }
  })
  h.check('panning keeps every live board frame mounted without reloading it', result.count >= 2 && result.loads === 0 && result.same, JSON.stringify(result))
}

async function checkBoardUpdateKeepsFrames(h: Harness) {
  const result = await h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & {
      board: { direction: 'ltr' | 'rtl'; items: BoardItem[]; labels: unknown[]; sections: unknown[] }
    }
    const frames = [...(board.shadowRoot?.querySelectorAll('iframe') ?? [])]
    board.board = { ...board.board, items: board.board.items.map((item) => ({ ...item, x: item.x + 12 })) }
    const current = [...(board.shadowRoot?.querySelectorAll('iframe') ?? [])]
    return { same: frames.length === current.length && frames.every((frame, index) => frame === current[index]), count: frames.length }
  })
  h.check('setting a moved board keeps every unchanged live frame', result.count >= 2 && result.same, JSON.stringify(result))
}

export async function verifyBoard(h: Harness) {
  await h.page.goto(h.url('board.html'))
  const board = h.page.locator('segnavia-board')
  await h.page.waitForFunction(() => document.querySelector('segnavia-board')?.shadowRoot?.querySelectorAll('[data-board-item]').length, undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  await h.page.waitForFunction(
    () => {
      const root = document.querySelector('segnavia-board')?.shadowRoot
      const labels = { 'deck-small': 'Creating a class', 'deck-hebrew': 'מצגת', page: 'Page', paper: 'Paper', image: 'Image', shot: 'Shot' }
      return Object.entries(labels).every(([id, label]) => root?.querySelector(`[data-board-item="${id}"]`)?.getAttribute('aria-label') === label)
    },
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  await checkPlacement(h, 'after fit')

  const farInitially = await board.evaluate((element) => Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-far"]')))
  h.check('a far board item is not mounted after the initial fit', !farInitially, String(farInitially))

  const small = board.locator('[data-board-item="deck-small"]')
  const initialTier = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    return { width: item?.getBoundingClientRect().width ?? 0, iframe: Boolean(item?.querySelector('iframe')) }
  })
  h.check('a board item narrower than 240px has no iframe', initialTier.width < 240 && !initialTier.iframe, JSON.stringify(initialTier))

  const box = await small.boundingBox()
  if (!box) throw new Error('The small board item has no box.')
  await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await h.page.keyboard.down('Control')
  await h.page.mouse.wheel(0, -100)
  await h.page.keyboard.up('Control')
  await h.page
    .waitForFunction(
      () => {
        const item = document.querySelector('segnavia-board')?.shadowRoot?.querySelector('[data-board-item="deck-small"]')
        return (item?.getBoundingClientRect().width ?? 0) >= 240 && Boolean(item?.querySelector('iframe'))
      },
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => {})
  const live = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    return { width: item?.getBoundingClientRect().width ?? 0, iframe: Boolean(item?.querySelector('iframe')) }
  })
  h.check('zooming a board item past 240px mounts its live element', live.width >= 240 && live.iframe, JSON.stringify(live))
  await checkPlacement(h, 'after zooming at a point')

  await showTwoLiveItems(h)
  await checkPanKeepsFrames(h)

  await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { direction: 'ltr' | 'rtl' } }
    value.board = { ...value.board, direction: 'rtl' }
  })
  await checkPlacement(h, 'with a right-to-left board')

  await showTwoLiveItems(h)
  await checkBoardUpdateKeepsFrames(h)
  await checkPlacement(h, 'after setting moved item positions')

  const sandboxes = await board.evaluate((element) => [...(element.shadowRoot?.querySelectorAll('iframe') ?? [])].map((frame) => frame.getAttribute('sandbox')))
  h.check(
    'every board iframe is sandboxed without same-origin',
    sandboxes.length > 0 && sandboxes.every((value) => value !== null && !value.includes('allow-same-origin')),
    sandboxes.join(','),
  )

  await small.focus()
  await h.page.keyboard.press('Enter')
  const opened = await h.page.evaluate(() => (window as typeof window & { openedItem?: { id: string } }).openedItem?.id)
  h.check('Enter on a focused board item emits segnavia-board-open', opened === 'deck-small', String(opened))

  const panDelta = await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { items: Array<{ id: string; x: number }> }; view: { zoom: number; pan: { x: number } } }
    const far = value.board.items.find((item) => item.id === 'deck-far')
    return far ? far.x * value.view.zoom + value.view.pan.x - value.clientWidth / 2 : 0
  })
  await h.page.mouse.move(640, 400)
  await h.page.mouse.wheel(panDelta, 0)
  await h.page.waitForFunction(() => Boolean(document.querySelector('segnavia-board')?.shadowRoot?.querySelector('[data-board-item="deck-far"]')), undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  const farAfterPan = await board.evaluate((element) => Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-far"]')))
  h.check('panning to a far board item mounts it', farAfterPan, String(farAfterPan))
}
