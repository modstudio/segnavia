import type { BoardView } from '@segnavia/format'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

export async function checkBoardChrome(h: Harness) {
  const board = h.page.locator('segnavia-board')
  const list = h.page.locator('segnavia-board-list')
  await list.locator('input[type="search"]').fill('')
  await list.locator('[data-board-item="deck-small"]').waitFor({ state: 'visible', timeout: BOUNDED_WAIT_MS })
  await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { direction: 'ltr' | 'rtl' }; fitAll(): void; selection: readonly string[] }
    value.board = { ...value.board, direction: 'ltr' }
    value.selection = []
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
    const board = document.querySelector('segnavia-board') as (HTMLElement & { selection: readonly string[] }) | null
    const node = board?.shadowRoot?.querySelector('[data-board-item="deck-small"]')
    const events = (window as typeof window & { boardSelections: Array<{ items: Array<{ id: string }> }> }).boardSelections
    return { selection: board?.selection, attribute: node?.hasAttribute('data-selected'), events: events.length, detail: events[0]?.items[0]?.id }
  })
  h.check(
    'clicking an item selects and marks it and emits one selection event',
    selection.selection?.join() === 'deck-small' && selection.attribute === true && selection.events === 1 && selection.detail === 'deck-small',
    JSON.stringify(selection),
  )

  await board.evaluate((element) => {
    ;(element as HTMLElement & { selection: readonly string[] }).selection = []
  })
  await h.page.mouse.move(0, 0)
  await item.focus()
  await h.page.keyboard.press('Tab')
  const tabbedAction = await board.evaluate((element) => {
    const active = element.shadowRoot?.activeElement as HTMLElement | null
    return {
      action: active?.dataset.action,
      item: active?.dataset.boardItemAction,
      selection: (element as HTMLElement & { selection: readonly string[] }).selection,
    }
  })
  h.check(
    'Tab from an unselected item reaches its first action without selecting it',
    tabbedAction.action === 'open' && tabbedAction.item === 'deck-small' && tabbedAction.selection.length === 0,
    JSON.stringify(tabbedAction),
  )

  await board.evaluate((element) => {
    const value = element as HTMLElement & { zoomTo(zoom: number): void; reveal(id: string): boolean }
    value.zoomTo(1)
    value.reveal('paper')
  })
  await board.locator('[data-board-title="paper"] [part~="item-name"]').click()
  const titleSelected = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('clicking an item title selects its item', titleSelected.join() === 'paper', String(titleSelected))
  await board.evaluate((element) => (element as HTMLElement & { reveal(id: string): boolean }).reveal('deck-small'))
  await item.click()

  const idleActions = await board
    .locator('[data-board-item="deck-hebrew"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).opacity)
  await board.locator('[data-board-item="deck-hebrew"]').hover()
  const hoverActions = await board
    .locator('[data-board-item="deck-hebrew"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).opacity)
  const selectedActions = await board
    .locator('[data-board-item="deck-small"] + [part~="item-title"] [part~="item-actions"]')
    .evaluate((element) => getComputedStyle(element).opacity)
  h.check(
    'item actions are hidden while idle and visible on hover and selection',
    idleActions === '0' && hoverActions === '1' && selectedActions === '1',
    JSON.stringify({ idleActions, hoverActions, selectedActions }),
  )

  const beforeAction = await board.evaluate((element) => {
    const value = element as HTMLElement & { selection: readonly string[]; view: BoardView }
    return { selection: value.selection, view: value.view }
  })
  await board.locator('[data-board-item="deck-small"] + [part~="item-title"] [data-action="download"]').click()
  const afterAction = await h.page.evaluate(() => {
    const board = document.querySelector('segnavia-board') as HTMLElement & { selection: readonly string[]; view: BoardView }
    const actions = (window as typeof window & { boardActions: Array<{ action: string; item: { id: string } }> }).boardActions
    return { selection: board.selection, view: board.view, actions: actions.map((entry) => ({ action: entry.action, item: entry.item.id })) }
  })
  h.check(
    'Download emits once without changing selection or view',
    afterAction.actions.length === 1 &&
      afterAction.actions[0]?.action === 'download' &&
      afterAction.actions[0]?.item === 'deck-small' &&
      JSON.stringify(afterAction.selection) === JSON.stringify(beforeAction.selection) &&
      JSON.stringify(afterAction.view) === JSON.stringify(beforeAction.view),
    JSON.stringify({ beforeAction, afterAction }),
  )
  const imageDownload = await board.locator('[data-board-item="image"] + [part~="item-title"] [data-action="download"]').count()
  h.check('Download is absent from an image title', imageDownload === 0, String(imageDownload))

  await board.evaluate((element) => {
    ;(element as HTMLElement & { selection: readonly string[] }).selection = []
  })
  await item.hover()
  const actionBox = await board.locator('[data-board-item="deck-small"] + [part~="item-title"] [data-action="open"]').boundingBox()
  const actionItemBox = await item.boundingBox()
  if (!actionBox || !actionItemBox) throw new Error('The action or its item has no box for the canceled action check.')
  const actionCount = afterAction.actions.length
  await h.page.mouse.move(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2)
  await h.page.mouse.down()
  await h.page.mouse.move(actionItemBox.x + actionItemBox.width / 2, actionItemBox.y + actionItemBox.height / 2)
  await h.page.mouse.up()
  const canceledAction = await h.page.evaluate(() => ({
    selection: (document.querySelector('segnavia-board') as HTMLElement & { selection: readonly string[] }).selection,
    actions: (window as typeof window & { boardActions: unknown[] }).boardActions.length,
  }))
  h.check(
    'releasing an action press over its item does not select or activate it',
    canceledAction.selection.length === 0 && canceledAction.actions === actionCount,
    JSON.stringify({ actionCount, canceledAction }),
  )

  await board.evaluate((element) => {
    const value = element as HTMLElement & { board: { items: Array<{ id: string; x: number; y: number }> }; view: BoardView }
    const page = value.board.items.find((entry) => entry.id === 'page')
    if (!page) throw new Error('The board has no page item.')
    value.view = { zoom: 1, pan: { x: 48 - page.x, y: 100 - page.y }, viewport: value.view.viewport }
  })
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
  await board.evaluate((element) => (element as HTMLElement & { reveal(id: string): boolean }).reveal('deck-small'))

  await item.focus()
  await h.page.keyboard.press('Escape')
  selection = (await board.evaluate((element) => ({ selection: (element as HTMLElement & { selection: readonly string[] }).selection }))) as typeof selection
  h.check('Escape clears board selection', selection.selection?.length === 0, JSON.stringify(selection))
  await item.click()
  const boardBox = await board.boundingBox()
  if (!boardBox) throw new Error('The board has no box for selection checks.')
  await h.page.mouse.click(boardBox.x + boardBox.width - 12, boardBox.y + boardBox.height - 12)
  const emptySelected = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('clicking empty board surface clears selection', emptySelected.length === 0, String(emptySelected))

  await board.evaluate((element) => {
    ;(element as HTMLElement & { selection: readonly string[] }).selection = []
  })
  const dragBox = await item.boundingBox()
  if (!dragBox) throw new Error('The board item has no box for the drag check.')
  await h.page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await h.page.mouse.down()
  await h.page.mouse.move(dragBox.x + dragBox.width / 2 + 24, dragBox.y + dragBox.height / 2 + 12)
  await h.page.mouse.up()
  const dragSelected = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('dragging an item selects it while editing is attached', dragSelected.join() === 'deck-small', String(dragSelected))

  await list.locator('[data-board-item="deck-hebrew"]').click()
  const listSelected = await board.evaluate((element) => (element as HTMLElement & { selection: readonly string[] }).selection)
  h.check('choosing a list item selects it', listSelected.join() === 'deck-hebrew', String(listSelected))

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
