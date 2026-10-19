import type { BoardView } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

export async function checkBoardChrome(h: Harness) {
  const board = h.page.locator('segnavia-board')
  const list = h.page.locator('segnavia-board-list')
  await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { direction: 'ltr' | 'rtl' }; fitAll(): void; selected: string | null }
    value.board = { ...value.board, direction: 'ltr' }
    value.selected = null
    value.fitAll()
    const state = window as typeof window & { boardSelections: unknown[]; boardActions: unknown[] }
    state.boardSelections = []
    state.boardActions = []
  })

  const icons = await h.page.evaluate(() => {
    const board = document.querySelector('segnavia-board')
    const list = document.querySelector('segnavia-board-list')
    const title = board?.shadowRoot?.querySelector('[data-kind-icon="deck"]')
    const listed = list?.shadowRoot?.querySelector('[data-board-item="deck-small"] [data-kind-icon="deck"]')
    const deckIcons = [...(board?.shadowRoot?.querySelectorAll('[data-kind-icon="deck"]') ?? [])]
    return { title: Boolean(title), listed: Boolean(listed), distinct: deckIcons.length >= 2 && deckIcons[0] !== deckIcons[1] }
  })
  h.check('board titles and list rows show distinct kind icon nodes', icons.title && icons.listed && icons.distinct, JSON.stringify(icons))

  const item = board.locator('[data-board-item="deck-small"]')
  await item.click()
  let selection = await h.page.evaluate(() => {
    const board = document.querySelector('segnavia-board') as (HTMLElement & { selected: string | null }) | null
    const node = board?.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    const events = (window as typeof window & { boardSelections: Array<{ item: { id: string } | null }> }).boardSelections
    return { selected: board?.selected, attribute: node?.hasAttribute('data-selected'), events: events.length, detail: events[0]?.item?.id }
  })
  h.check(
    'clicking an item selects and marks it and emits one selection event',
    selection.selected === 'deck-small' && selection.attribute === true && selection.events === 1 && selection.detail === 'deck-small',
    JSON.stringify(selection),
  )

  const idleActions = await board
    .locator('[data-board-item="deck-hebrew"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).visibility)
  await board.locator('[data-board-item="deck-hebrew"]').hover()
  const hoverActions = await board
    .locator('[data-board-item="deck-hebrew"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).visibility)
  const selectedActions = await board
    .locator('[data-board-item="deck-small"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).visibility)
  h.check(
    'item actions are hidden while idle and visible on hover and selection',
    idleActions === 'hidden' && hoverActions === 'visible' && selectedActions === 'visible',
    JSON.stringify({ idleActions, hoverActions, selectedActions }),
  )

  const beforeAction = await board.evaluate((element) => {
    const value = element as HTMLElement & { selected: string | null; view: BoardView }
    return { selected: value.selected, view: value.view }
  })
  await board.locator('[data-board-item="deck-small"] + [part~="item-title"] [data-action="download"]').click()
  const afterAction = await h.page.evaluate(() => {
    const board = document.querySelector('segnavia-board') as HTMLElement & { selected: string | null; view: BoardView }
    const actions = (window as typeof window & { boardActions: Array<{ action: string; item: { id: string } }> }).boardActions
    return { selected: board.selected, view: board.view, actions: actions.map((entry) => ({ action: entry.action, item: entry.item.id })) }
  })
  h.check(
    'Download emits once without changing selection or view',
    afterAction.actions.length === 1 &&
      afterAction.actions[0]?.action === 'download' &&
      afterAction.actions[0]?.item === 'deck-small' &&
      afterAction.selected === beforeAction.selected &&
      JSON.stringify(afterAction.view) === JSON.stringify(beforeAction.view),
    JSON.stringify({ beforeAction, afterAction }),
  )
  const imageDownload = await board.locator('[data-board-item="image"] + [part~="item-title"] [data-action="download"]').count()
  h.check('Download is absent from an image title', imageDownload === 0, String(imageDownload))

  const truncation = await board.evaluate((element) => {
    const item = element.shadowRoot?.querySelector('[data-board-item="page"]')?.getBoundingClientRect()
    const title = element.shadowRoot?.querySelector('[data-board-item="page"] + [part~="item-title"]')?.getBoundingClientRect()
    const name = element.shadowRoot?.querySelector<HTMLElement>('[data-board-item="page"] + [part~="item-title"] [part~="item-name"]')
    return { item: item?.width, title: title?.width, client: name?.clientWidth, scroll: name?.scrollWidth }
  })
  h.check(
    'a long title truncates within its item width',
    Boolean(truncation.item && truncation.title && truncation.title <= truncation.item + 1 && (truncation.scroll ?? 0) > (truncation.client ?? 0)),
    JSON.stringify(truncation),
  )

  await h.page.keyboard.press('Escape')
  selection = (await board.evaluate((element) => ({ selected: (element as HTMLElement & { selected: string | null }).selected }))) as typeof selection
  h.check('Escape clears board selection', selection.selected === null, JSON.stringify(selection))
  await item.click()
  const boardBox = await board.boundingBox()
  if (!boardBox) throw new Error('The board has no box for selection checks.')
  await h.page.mouse.click(boardBox.x + boardBox.width - 12, boardBox.y + boardBox.height - 12)
  const emptySelected = await board.evaluate((element) => (element as HTMLElement & { selected: string | null }).selected)
  h.check('clicking empty board surface clears selection', emptySelected === null, String(emptySelected))

  await board.evaluate((element) => {
    ;(element as HTMLElement & { selected: string | null }).selected = null
  })
  const dragBox = await item.boundingBox()
  if (!dragBox) throw new Error('The board item has no box for the drag check.')
  await h.page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await h.page.mouse.down()
  await h.page.mouse.move(dragBox.x + dragBox.width / 2 + 24, dragBox.y + dragBox.height / 2 + 12)
  await h.page.mouse.up()
  const dragSelected = await board.evaluate((element) => (element as HTMLElement & { selected: string | null }).selected)
  h.check('dragging pans without selecting', dragSelected === null, String(dragSelected))

  await list.locator('[data-board-item="deck-hebrew"]').click()
  const listSelected = await board.evaluate((element) => (element as HTMLElement & { selected: string | null }).selected)
  h.check('choosing a list item selects it', listSelected === 'deck-hebrew', String(listSelected))

  await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { direction: 'ltr' | 'rtl' }; fitAll(): void }
    value.board = { ...value.board, direction: 'rtl' }
    value.fitAll()
  })
  const rtl = await board.evaluate((element) => {
    const title = element.shadowRoot?.querySelector('[data-board-item="deck-small"] + [part~="item-title"]')
    const icon = title?.querySelector('[part~="item-icon"]')?.getBoundingClientRect()
    const name = title?.querySelector('[part~="item-name"]')?.getBoundingClientRect()
    const actions = title?.querySelector('[part~="item-actions"]')?.getBoundingClientRect()
    return { iconRight: icon?.right, nameRight: name?.right, nameLeft: name?.left, actionsRight: actions?.right }
  })
  h.check(
    'right-to-left titles place the icon right of the name and actions to its left',
    (rtl.iconRight ?? 0) > (rtl.nameRight ?? 0) && (rtl.actionsRight ?? Number.POSITIVE_INFINITY) <= (rtl.nameLeft ?? 0),
    JSON.stringify(rtl),
  )

  await checkListToggle(h)
}

async function checkListToggle(h: Harness) {
  const toolbar = h.page.locator('segnavia-board-toolbar')
  const list = h.page.locator('segnavia-board-list')
  const board = h.page.locator('segnavia-board')
  const before = await board.evaluate((element) => element.getBoundingClientRect().width)
  await toolbar.locator('[slot="icon-list"]').click()
  await h.page.waitForFunction(() => (document.querySelector('segnavia-board-list') as HTMLElement | null)?.hidden, undefined, {
    timeout: BOUNDED_WAIT_MS,
  })
  const hidden = await h.page.evaluate(() => {
    const list = document.querySelector('segnavia-board-list') as HTMLElement
    const toolbar = document.querySelector('segnavia-board-toolbar')
    return {
      display: getComputedStyle(list).display,
      width: list.getBoundingClientRect().width,
      board: document.querySelector('segnavia-board')?.getBoundingClientRect().width,
      pressed: toolbar?.shadowRoot?.querySelector('[part~="list"]')?.getAttribute('aria-pressed'),
    }
  })
  h.check(
    'the list toggle hides the list, releases its width, grows the board and becomes unpressed',
    hidden.display === 'none' && hidden.width === 0 && (hidden.board ?? 0) > before && hidden.pressed === 'false',
    JSON.stringify({ before, hidden }),
  )
  await toolbar.locator('[slot="icon-list"]').click()
  const restored = await h.page.evaluate(() => {
    const list = document.querySelector('segnavia-board-list') as HTMLElement
    const toolbar = document.querySelector('segnavia-board-toolbar')
    return {
      display: getComputedStyle(list).display,
      width: list.getBoundingClientRect().width,
      board: document.querySelector('segnavia-board')?.getBoundingClientRect().width,
      pressed: toolbar?.shadowRoot?.querySelector('[part~="list"]')?.getAttribute('aria-pressed'),
    }
  })
  h.check(
    'the list toggle restores the list, board width and pressed state',
    restored.display !== 'none' && restored.width > 0 && Math.abs((restored.board ?? 0) - before) <= 1 && restored.pressed === 'true',
    JSON.stringify({ before, restored }),
  )
  await toolbar.evaluate((element) => element.addEventListener('segnavia-board-list-toggle', (event) => event.preventDefault(), { once: true }))
  await toolbar.locator('[slot="icon-list"]').click()
  const canceled = await list.evaluate((element) => ({ hidden: (element as HTMLElement).hidden, width: element.getBoundingClientRect().width }))
  h.check('canceling the list toggle leaves the list shown', canceled.hidden === false && canceled.width > 0, JSON.stringify(canceled))
}
