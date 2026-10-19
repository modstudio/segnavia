import { type BoardItem, type BoardView, boardToScreen, itemHeight, type Size } from '@segnavia/format'
import { checkBoardChrome } from './board-chrome.ts'
import { checkBoardToolbar } from './board-toolbar.ts'
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
  'deck-url': { width: 1280, height: 720 },
  'paper-empty': { width: 816, height: 1056 },
  'deck-far': { width: 1280, height: 720 },
}

async function showItem(h: Harness, id: string) {
  await h.page.locator('segnavia-board').evaluate((element, itemId) => {
    const board = element as HTMLElement & { board: { items: BoardItem[] }; view: BoardView }
    const item = board.board.items.find((entry) => entry.id === itemId)
    if (!item) throw new Error(`The board has no ${itemId} item.`)
    try {
      board.view = { zoom: 1, pan: { x: 48 - item.x, y: 100 - item.y }, viewport: board.view.viewport }
    } catch {}
  }, id)
}

async function checkUrlDeckRefusesScripts(h: Harness) {
  await showItem(h, 'deck-url')
  await h.page.waitForFunction(
    () =>
      Boolean(
        document
          .querySelector('segnavia-board')
          ?.shadowRoot?.querySelector('[data-board-item="deck-url"] segnavia-thumbnail')
          ?.shadowRoot?.querySelector('iframe'),
      ),
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  await h.page.waitForTimeout(250)
  const result = await h.page.evaluate(() => {
    const frame = document
      .querySelector('segnavia-board')
      ?.shadowRoot?.querySelector('[data-board-item="deck-url"] segnavia-thumbnail')
      ?.shadowRoot?.querySelector('iframe')
    const state = window as typeof window & { boardScriptRan?: boolean }
    return { ran: state.boardScriptRan, sandbox: frame?.getAttribute('sandbox') }
  })
  h.check('a live board URL deck refuses scripts with an empty sandbox', result.ran === false && result.sandbox === '', JSON.stringify(result))
}

async function checkFailedLiveMount(h: Harness) {
  await showItem(h, 'paper-empty')
  await h.page.waitForTimeout(250)
  await h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & { view: BoardView }
    for (let step = 0; step < 5; step += 1) {
      try {
        board.view = { ...board.view, pan: { ...board.view.pan, x: board.view.pan.x + 2 } }
      } catch {}
    }
  })
  await h.page.waitForTimeout(100)
  const result = await h.page.evaluate(() => {
    const state = window as typeof window & { boardErrors?: unknown[]; boardUnhandled?: unknown[] }
    const item = document.querySelector('segnavia-board')?.shadowRoot?.querySelector('[data-board-item="paper-empty"]')
    return {
      errors: state.boardErrors?.length ?? 0,
      unhandled: state.boardUnhandled?.length ?? 0,
      placeholder: Boolean(item?.querySelector('[part~="placeholder"]')),
    }
  })
  h.check(
    'a failing live board mount reports once, stays a placeholder and has no unhandled rejection',
    result.errors === 1 && result.unhandled === 0 && result.placeholder,
    JSON.stringify(result),
  )
}

async function checkReconnect(h: Harness) {
  await showItem(h, 'deck-url')
  await h.page.waitForFunction(
    () =>
      Boolean(
        document
          .querySelector('segnavia-board')
          ?.shadowRoot?.querySelector('[data-board-item="deck-url"] segnavia-thumbnail')
          ?.shadowRoot?.querySelector('iframe'),
      ),
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  await h.page.locator('segnavia-board').evaluate((element) => {
    const parent = element.parentNode
    element.remove()
    parent?.append(element)
  })
  await h.page
    .waitForFunction(
      () =>
        Boolean(
          document
            .querySelector('segnavia-board')
            ?.shadowRoot?.querySelector('[data-board-item="deck-url"] segnavia-thumbnail')
            ?.shadowRoot?.querySelector('iframe'),
        ),
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => {})
  const result = await h.page.locator('segnavia-board').evaluate((element) => ({
    item: Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-url"]')),
    live: Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-url"] segnavia-thumbnail')?.shadowRoot?.querySelector('iframe')),
  }))
  h.check('reconnecting a board at the same size restores its items and live content', result.item && result.live, JSON.stringify(result))
}

async function placementFacts(h: Harness) {
  return h.page.locator('segnavia-board').evaluate((element) => {
    const board = element as HTMLElement & { board: { items: BoardItem[]; labels: Array<{ text: string; x: number; y: number }> }; view: unknown }
    const host = board.getBoundingClientRect()
    const boxes: MountedBox[] = [...(board.shadowRoot?.querySelectorAll<HTMLElement>('[data-board-item]') ?? [])].map((item) => {
      const box = item.getBoundingClientRect()
      return { id: item.dataset.boardItem ?? '', x: box.x - host.x, y: box.y - host.y, width: box.width, height: box.height }
    })
    const labels = [...(board.shadowRoot?.querySelectorAll<HTMLElement>('[part~="label"]') ?? [])].map((label) => {
      const box = label.getBoundingClientRect()
      return { text: label.textContent ?? '', x: box.x - host.x, y: box.y - host.y }
    })
    return { board: board.board, view: board.view, boxes, labels }
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
  const labelMismatches = facts.labels.flatMap((box) => {
    const label = facts.board.labels.find((entry) => entry.text === box.text)
    if (!label) return [`${box.text}: missing data`]
    const point = boardToScreen(facts.view as Parameters<typeof boardToScreen>[0], label)
    return Math.max(Math.abs(box.x - point.x), Math.abs(box.y - point.y)) <= 1 ? [] : [`${box.text}: ${JSON.stringify({ box, expected: point })}`]
  })
  h.check(`board labels match boardToScreen ${moment}`, facts.labels.length > 0 && labelMismatches.length === 0, labelMismatches.join('; '))
}

async function showTwoLiveItems(h: Harness) {
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

async function checkPanKeepsFrames(h: Harness) {
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

async function checkBoardUpdateKeepsFrames(h: Harness) {
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

export async function verifyBoard(h: Harness) {
  await h.page.goto(h.url('board.html'))
  const board = h.page.locator('segnavia-board')
  await h.page.waitForFunction(() => document.querySelector('segnavia-board')?.shadowRoot?.querySelectorAll('[data-board-item]').length, undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  await h.page.waitForFunction(
    () => {
      const root = document.querySelector('segnavia-board')?.shadowRoot
      const labels = {
        'deck-small': 'Creating a class',
        'deck-hebrew': 'מַצֶּגֶת',
        page: 'A page with a deliberately long title that truncates',
        paper: 'Paper',
        image: 'Image',
        shot: 'Shot',
      }
      return (
        Object.entries(labels).every(([id, label]) => root?.querySelector(`[data-board-item="${id}"]`)?.getAttribute('aria-label') === label) &&
        Boolean(root?.querySelector('[data-board-item="image"] img')) &&
        Boolean(root?.querySelector('[data-board-item="shot"] img'))
      )
    },
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
  await checkPlacement(h, 'after fit')

  const farInitially = await board.evaluate((element) => Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-far"]')))
  h.check('a far board item is not mounted after the initial fit', !farInitially, String(farInitially))

  const initialNameCalls = await h.page.evaluate(() => (window as typeof window & { initialItemNamesCalls?: number }).initialItemNamesCalls)
  h.check('board item names are requested once for the initial board', initialNameCalls === 1, String(initialNameCalls))

  const viewBeforeList = await board.evaluate((element) => (element as HTMLElement & { view: BoardView }).view)
  const list = h.page.locator('segnavia-board-list')
  const search = list.locator('input[type="search"]')
  const nameAlignment = await list.evaluate((element) => {
    const rangeLeft = (selector: string) => {
      const text = element.shadowRoot?.querySelector(selector)?.firstChild
      if (!text) return Number.NaN
      const range = document.createRange()
      range.selectNodeContents(text)
      return range.getBoundingClientRect().left
    }
    return { english: rangeLeft('[data-board-item="deck-small"]'), hebrew: rangeLeft('[data-board-item="deck-hebrew"]') }
  })
  h.check(
    'Hebrew and English list names align to the list inline start',
    Math.abs(nameAlignment.english - nameAlignment.hebrew) <= 1,
    JSON.stringify(nameAlignment),
  )
  const titleAlignment = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-hebrew"]')
    const icon = item?.nextElementSibling?.querySelector('[part~="item-icon"]')
    return { item: item?.getBoundingClientRect().left ?? Number.NaN, title: icon?.getBoundingClientRect().left ?? Number.NaN }
  })
  h.check(
    'a Hebrew board item title icon aligns to the item inline start',
    Math.abs(titleAlignment.item - titleAlignment.title) <= 1,
    JSON.stringify(titleAlignment),
  )
  await search.fill('creating')
  const filtered = await list.locator('[data-board-item]').evaluateAll((items) => items.map((item) => item.getAttribute('data-board-item')))
  h.check('typing an item name filters the board list immediately', filtered.length === 1 && filtered[0] === 'deck-small', filtered.join(','))
  await search.fill('far')
  await list.locator('[data-board-item="deck-far"]').click()
  await h.page.waitForFunction(() => Boolean(document.querySelector('segnavia-board')?.shadowRoot?.querySelector('[data-board-item="deck-far"]')), undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  const revealed = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-far"]')?.getBoundingClientRect()
    const viewport = element.getBoundingClientRect()
    return Boolean(item && item.left >= viewport.left && item.right <= viewport.right && item.top >= viewport.top && item.bottom <= viewport.bottom)
  })
  h.check('clicking a listed far item reveals it mounted and on screen', revealed, String(revealed))
  await search.fill('')
  await board.evaluate((element, view) => {
    ;(element as HTMLElement & { view: BoardView }).view = view
  }, viewBeforeList)

  const small = board.locator('[data-board-item="deck-small"]')
  const initialTier = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    return { width: item?.getBoundingClientRect().width ?? 0, iframe: Boolean(item?.querySelector('segnavia-thumbnail')?.shadowRoot?.querySelector('iframe')) }
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
        return (item?.getBoundingClientRect().width ?? 0) >= 240 && Boolean(item?.querySelector('segnavia-thumbnail')?.shadowRoot?.querySelector('iframe'))
      },
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => {})
  const live = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    return { width: item?.getBoundingClientRect().width ?? 0, iframe: Boolean(item?.querySelector('segnavia-thumbnail')?.shadowRoot?.querySelector('iframe')) }
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

  const sandboxes = await board.evaluate((element) =>
    [
      ...(element.shadowRoot?.querySelectorAll('iframe') ?? []),
      ...[...(element.shadowRoot?.querySelectorAll('segnavia-thumbnail') ?? [])].flatMap((thumbnail) => {
        const frame = thumbnail.shadowRoot?.querySelector('iframe')
        return frame ? [frame] : []
      }),
    ].map((frame) => frame.getAttribute('sandbox')),
  )
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

  await h.page.evaluate(() => (window as typeof window & { addBoardReviewItems(): void }).addBoardReviewItems())
  await checkUrlDeckRefusesScripts(h)
  await checkReconnect(h)
  await checkFailedLiveMount(h)
  await checkBoardChrome(h)
  await checkBoardToolbar(h)
}
