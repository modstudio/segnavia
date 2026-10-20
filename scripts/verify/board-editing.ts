import { center, drag, waitChanges } from './board-editing-actions.ts'
import { checkBoardSelectionCompatibility } from './board-editing-compatibility.ts'
import { checkBoardEditingReset } from './board-editing-reset.ts'
import { checkBoardEditingSections } from './board-editing-sections.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

interface DemoItem {
  id: string
  x: number
  y: number
  width: number
}
interface DemoSection {
  id: string
  rectangle: { x: number; y: number; width: number; height: number }
  items: string[]
}
interface DemoBoard {
  direction: 'ltr' | 'rtl'
  items: DemoItem[]
  sections: DemoSection[]
}
interface DemoChange {
  board: DemoBoard
  edit: { kind: string; ids?: string[] }
}
type BoardElement = HTMLElement & {
  board: DemoBoard
  selection: readonly string[]
  selected: string | null
  view: { zoom: number; pan: { x: number; y: number }; viewport: { width: number; height: number } }
}
type DemoWindow = typeof window & {
  boardChanges: DemoChange[]
  boardEditErrors: unknown[]
  hostBoard: DemoBoard
  boardEditing: {
    canUndo: boolean
    add(input: { kind: string; address: string }): string | undefined
    detach(): void
  }
}

export async function checkBoardEditing(h: Harness) {
  const board = h.page.locator('segnavia-board')
  const original = await board.evaluate((element) => structuredClone((element as BoardElement).board))
  const reset = async (direction: 'ltr' | 'rtl' = 'ltr') => {
    await board.evaluate(
      (element, args) => {
        const value = element as BoardElement
        const next = structuredClone(args.original)
        next.direction = args.direction
        next.items = next.items.map((item) => {
          if (item.id === 'deck-small') return { ...item, x: 0, y: 0, width: 220 }
          if (item.id === 'deck-hebrew') return { ...item, x: 300, y: 0, width: 320 }
          if (item.id === 'page') return { ...item, x: 700, y: 0, width: 180 }
          return item
        })
        next.sections = next.sections.map((section) =>
          section.id === 'section' ? { ...section, rectangle: { x: -24, y: -56, width: 668, height: 236 }, items: ['deck-small', 'deck-hebrew'] } : section,
        )
        value.board = next
        value.selection = []
        value.view = { ...value.view, zoom: 1, pan: { x: 100, y: 150 } }
        const state = window as unknown as DemoWindow
        state.boardChanges = []
        state.boardEditErrors = []
        state.hostBoard = next
      },
      { original, direction },
    )
  }
  const selection = () => board.evaluate((element) => (element as BoardElement).selection)
  const first = board.locator('[data-board-item="deck-small"]')
  const second = board.locator('[data-board-item="deck-hebrew"]')
  const hostBox = await board.boundingBox()
  if (!hostBox) throw new Error('The board has no box for editing checks.')

  await checkBoardEditingSections(h, board, first, second, reset)

  await checkBoardSelectionCompatibility(h, board, second, reset)
  await reset()
  await h.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await first.click()
  const focused = await board.evaluate((element) => {
    const documentFocused = document.activeElement === element
    const item = (element.shadowRoot?.activeElement as HTMLElement | null)?.dataset.boardItem
    return { document: documentFocused, item, ok: documentFocused && item === 'deck-small' }
  })
  h.check('clicking an item focuses its node', focused.ok, JSON.stringify(focused))
  await second.click({ modifiers: ['Shift'] })
  let selected = await selection()
  h.check('shift-click adds a board item to selection', selected.join() === 'deck-small,deck-hebrew', selected.join())
  await second.click({ modifiers: ['Shift'] })
  selected = await selection()
  h.check('a second shift-click removes a board item from selection', selected.join() === 'deck-small', selected.join())

  const marquee = { x: hostBox.x + 50, y: hostBox.y + 90 }
  await drag(h.page, marquee, 700, 260)
  selected = await selection()
  h.check('a marquee selects exactly the two intersecting items', selected.join() === 'deck-small,deck-hebrew', selected.join())
  await board.evaluate((element) => ((element as BoardElement).selection = ['page']))
  await h.page.keyboard.down('Shift')
  await drag(h.page, marquee, 700, 260)
  await h.page.keyboard.up('Shift')
  selected = await selection()
  h.check('a shifted marquee adds its items to the selection', selected.join() === 'deck-small,deck-hebrew,page', selected.join())

  await first.focus()
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  const all = await board.evaluate((element) => ({ selected: (element as BoardElement).selection.length, items: (element as BoardElement).board.items.length }))
  h.check('Cmd or Ctrl+A selects every board item', all.selected === all.items, JSON.stringify(all))

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['deck-small', 'deck-hebrew']))
  const moveBefore = await board.evaluate((element) =>
    Object.fromEntries((element as BoardElement).board.items.slice(0, 2).map((item) => [item.id, { x: item.x, y: item.y }])),
  )
  await drag(h.page, await center(first), 40, 25)
  await waitChanges(h.page, 1)
  const moved = await board.evaluate((element, before: Record<string, { x: number; y: number }>) => {
    const value = element as BoardElement
    const ids = ['deck-small', 'deck-hebrew']
    const deltas = ids.map((id) => {
      const item = value.board.items.find((entry) => entry.id === id) as DemoItem
      return { x: item.x - (before[id]?.x ?? 0), y: item.y - (before[id]?.y ?? 0) }
    })
    const matches = ids.every((id) => {
      const item = value.board.items.find((entry) => entry.id === id) as DemoItem
      const stored = (window as unknown as DemoWindow).hostBoard.items.find((entry) => entry.id === id) as DemoItem
      const box = element.shadowRoot?.querySelector<HTMLElement>(`[data-board-item="${id}"]`)?.getBoundingClientRect()
      return stored.x === item.x && stored.y === item.y && Math.abs((box?.x ?? 0) - element.getBoundingClientRect().x - item.x - value.view.pan.x) < 1
    })
    return { deltas, matches, changes: (window as unknown as DemoWindow).boardChanges }
  }, moveBefore)
  h.check(
    'dragging a multi-selection moves every item equally and writes one matching move',
    moved.deltas.every((delta) => delta.x === 40 && delta.y === 25) &&
      moved.matches &&
      moved.changes.length === 1 &&
      moved.changes[0]?.edit.kind === 'move' &&
      moved.changes[0]?.edit.ids?.join() === 'deck-small,deck-hebrew',
    JSON.stringify(moved),
  )

  await reset()
  const title = board.locator('[data-board-section-title="section"]')
  const sectionBefore = await board.evaluate((element) => {
    const value = (element as BoardElement).board
    return {
      rectangle: (value.sections.find((entry) => entry.id === 'section') as DemoSection).rectangle,
      members: (value.sections.find((entry) => entry.id === 'section') as DemoSection).items,
      items: value.items.filter((item) => ['deck-small', 'deck-hebrew'].includes(item.id)).map(({ id, x, y }) => ({ id, x, y })),
    }
  })
  await drag(h.page, await center(title), 35, 20)
  await waitChanges(h.page, 1)
  const sectionAfter = await board.evaluate((element) => {
    const value = (element as BoardElement).board
    return {
      rectangle: (value.sections.find((entry) => entry.id === 'section') as DemoSection).rectangle,
      members: (value.sections.find((entry) => entry.id === 'section') as DemoSection).items,
      items: value.items.filter((item) => ['deck-small', 'deck-hebrew'].includes(item.id)).map(({ id, x, y }) => ({ id, x, y })),
      kind: (window as unknown as DemoWindow).boardChanges[0]?.edit.kind,
    }
  })
  h.check(
    'dragging a section chip moves its rectangle and member items',
    sectionAfter.items.every((item, i) => item.x === (sectionBefore.items[i]?.x ?? 0) + 35 && item.y === (sectionBefore.items[i]?.y ?? 0) + 20) &&
      sectionAfter.rectangle.x === sectionBefore.rectangle.x + 35 &&
      sectionAfter.rectangle.y === sectionBefore.rectangle.y + 20 &&
      sectionAfter.members.join() === sectionBefore.members.join() &&
      sectionAfter.kind === 'move-section',
    JSON.stringify({ sectionBefore, sectionAfter }),
  )

  await reset()
  await board.focus()
  const spaceBefore = await board.evaluate((element) => (element as BoardElement).view.pan.x)
  await h.page.keyboard.down('Space')
  await drag(h.page, { x: hostBox.x + hostBox.width / 2, y: hostBox.y + 600 }, -45, 0)
  await h.page.keyboard.up('Space')
  const spaceAfter = await board.evaluate((element) => ({ pan: (element as BoardElement).view.pan.x, selection: (element as BoardElement).selection }))
  h.check(
    'Space+drag pans without selecting while editing is attached',
    spaceAfter.pan === spaceBefore - 45 && spaceAfter.selection.length === 0,
    JSON.stringify(spaceAfter),
  )

  await reset()
  await first.click()
  const resizeBefore = await board.evaluate((element) => ({
    item: (element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem,
    box: element.shadowRoot?.querySelector<HTMLElement>('[data-board-item="deck-small"]')?.getBoundingClientRect().toJSON(),
  }))
  const handle = board.locator('[part~="resize-handle"][data-corner="bottom-right"]')
  await drag(h.page, await center(handle), 60, 0)
  await waitChanges(h.page, 1)
  const resizeAfter = await board.evaluate((element) => ({
    item: (element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem,
    box: element.shadowRoot?.querySelector<HTMLElement>('[data-board-item="deck-small"]')?.getBoundingClientRect().toJSON(),
    changes: (window as unknown as DemoWindow).boardChanges,
  }))
  h.check(
    'the bottom-right handle widens with its top-left fixed, aspect height and one resize change',
    resizeAfter.item.width === resizeBefore.item.width + 60 &&
      resizeAfter.item.x === resizeBefore.item.x &&
      resizeAfter.item.y === resizeBefore.item.y &&
      Math.abs(resizeAfter.box.x - resizeBefore.box.x) < 1 &&
      Math.abs(resizeAfter.box.y - resizeBefore.box.y) < 1 &&
      Math.abs(resizeAfter.box.height / resizeAfter.box.width - 9 / 16) < 0.01 &&
      resizeAfter.changes.length === 1 &&
      resizeAfter.changes[0]?.edit.kind === 'resize',
    JSON.stringify({ resizeBefore, resizeAfter }),
  )

  await reset()
  await first.click()
  await h.page.keyboard.press('Delete')
  await waitChanges(h.page, 1)
  const removed = await board.evaluate((element) => ({
    selection: (element as BoardElement).selection,
    item: Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-small"]')),
    title: Boolean(element.shadowRoot?.querySelector('[data-board-title="deck-small"]')),
  }))
  h.check(
    'Delete removes the selection, its item node and its title',
    !removed.item && !removed.title && removed.selection.length === 0,
    JSON.stringify(removed),
  )
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitChanges(h.page, 2)
  const undoRemove = await board.evaluate((element) => ({
    selected: (element as BoardElement).selection,
    item: Boolean(element.shadowRoot?.querySelector('[data-board-item="deck-small"]')),
  }))
  h.check('undoing a remove restores and selects the touched item', undoRemove.item && undoRemove.selected.join() === 'deck-small', JSON.stringify(undoRemove))

  await reset()
  const addedId = await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.add({ kind: 'deck', address: 'demo-added-deck' }))
  await waitChanges(h.page, 1)
  const added = await board.evaluate((element, expectedId) => {
    const id = (element as BoardElement).selection[0]
    const box = element.shadowRoot?.querySelector<HTMLElement>(`[data-board-item="${id}"]`)?.getBoundingClientRect()
    const host = element.getBoundingClientRect()
    return {
      id,
      expectedId,
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2 - host.x,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2 - host.y,
      width: host.width,
      height: host.height,
    }
  }, addedId)
  h.check(
    'add places an item at the view center and selects it',
    Boolean(added.id) && added.id === added.expectedId && Math.abs(added.x - added.width / 2) < 1 && Math.abs(added.y - added.height / 2) < 1,
    JSON.stringify(added),
  )
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitChanges(h.page, 2)
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Shift+Meta+Z' : 'Shift+Control+Z')
  await waitChanges(h.page, 3)
  const redoAdd = await board.evaluate(
    (element, id) => ({
      selected: (element as BoardElement).selection,
      item: Boolean(element.shadowRoot?.querySelector(`[data-board-item="${id}"]`)),
    }),
    addedId,
  )
  h.check('redoing an add restores and selects the added item', redoAdd.item && redoAdd.selected.join() === addedId, JSON.stringify(redoAdd))

  await reset()
  await first.click()
  const rollbackBefore = await board.evaluate((element) => ({
    x: ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x,
    canUndo: (window as unknown as DemoWindow).boardEditing.canUndo,
  }))
  await h.page.locator('#reject-change').check()
  await drag(h.page, await center(first), 45, 0)
  await h.page.waitForFunction(() => (window as unknown as DemoWindow).boardEditErrors?.length === 1, undefined, { timeout: BOUNDED_WAIT_MS })
  const rollbackAfter = await board.evaluate((element) => ({
    x: ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x,
    canUndo: (window as unknown as DemoWindow).boardEditing.canUndo,
    errors: (window as unknown as DemoWindow).boardEditErrors.length,
  }))
  h.check(
    'a rejected move snaps back, reports one edit error and leaves canUndo unchanged',
    rollbackAfter.x === rollbackBefore.x && rollbackAfter.errors === 1 && rollbackAfter.canUndo === rollbackBefore.canUndo,
    JSON.stringify({ rollbackBefore, rollbackAfter }),
  )

  await reset()
  await first.click()
  const historyStart = await board.evaluate((element) => ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x)
  await drag(h.page, await center(first), 30, 0)
  await waitChanges(h.page, 1)
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitChanges(h.page, 2)
  const undone = await board.evaluate((element) => ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x)
  await h.page.keyboard.press(process.platform === 'darwin' ? 'Shift+Meta+Z' : 'Shift+Control+Z')
  await waitChanges(h.page, 3)
  const history = await board.evaluate((element) => ({
    redone: ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x,
    kinds: (window as unknown as DemoWindow).boardChanges.map((change) => change.edit.kind),
  }))
  h.check(
    'Cmd or Ctrl+Z restores a move and Shift+Cmd or Ctrl+Z redoes it',
    undone === historyStart && history.redone === historyStart + 30 && history.kinds.join() === 'move,undo,redo',
    JSON.stringify({ historyStart, undone, history }),
  )

  await reset()
  await first.click()
  const keyBefore = await board.evaluate((element) => ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x)
  await h.page.keyboard.press('ArrowRight')
  await waitChanges(h.page, 1)
  await h.page.keyboard.press('Shift+ArrowRight')
  await waitChanges(h.page, 2)
  const keyAfter = await board.evaluate((element) => ((element as BoardElement).board.items.find((item) => item.id === 'deck-small') as DemoItem).x)
  h.check('arrow keys move a selected item by one or ten board units', keyAfter === keyBefore + 11, JSON.stringify({ keyBefore, keyAfter }))

  await reset()
  const touchBefore = await board.evaluate((element) => (element as BoardElement).view.pan.x)
  const session = await h.page.context().newCDPSession(h.page)
  const touchX = Math.round(hostBox.x + hostBox.width / 2)
  const touchY = Math.round(hostBox.y + 600)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX - 50, y: touchY }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const touchAfter = await board.evaluate((element) => ({
    pan: (element as BoardElement).view.pan.x,
    marquee: Boolean(element.shadowRoot?.querySelector('[part~="marquee"]')),
  }))
  h.check(
    'a one-finger touch drag pans and draws no marquee',
    touchAfter.pan !== touchBefore && !touchAfter.marquee,
    JSON.stringify({ touchBefore, touchAfter }),
  )

  const physical = async (direction: 'ltr' | 'rtl') => {
    await reset(direction)
    await first.click()
    const before = await first.boundingBox()
    await drag(h.page, await center(first), 25, 0)
    await waitChanges(h.page, 1)
    const afterMove = await first.boundingBox()
    const corner = board.locator('[part~="resize-handle"][data-corner="bottom-right"]')
    await drag(h.page, await center(corner), 40, 0)
    await waitChanges(h.page, 2)
    const afterResize = await first.boundingBox()
    return {
      move: (afterMove?.x ?? 0) - (before?.x ?? 0),
      resize: (afterResize?.width ?? 0) - (afterMove?.width ?? 0),
      fixed: Math.abs((afterResize?.x ?? 0) - (afterMove?.x ?? 0)) < 1,
    }
  }
  const ltr = await physical('ltr')
  const rtl = await physical('rtl')
  h.check(
    'right-to-left moving and resizing use the same physical coordinates as left-to-right',
    ltr.move === 25 && rtl.move === ltr.move && ltr.resize === 40 && rtl.resize === ltr.resize && ltr.fixed && rtl.fixed,
    JSON.stringify({ ltr, rtl }),
  )

  await reset()
  await board.evaluate((element) => {
    const value = element as BoardElement
    const current = structuredClone(value.board)
    value.board = null as unknown as DemoBoard
    value.board = current
  })
  await first.click()
  const handlesAfterNull = await board.locator('[part~="resize-handle"]').count()
  await h.page.mouse.move(marquee.x, marquee.y)
  await h.page.mouse.down()
  await h.page.mouse.move(marquee.x + 300, marquee.y + 200, { steps: 4 })
  const marqueeAfterNull = await board.locator('[part~="marquee"]').count()
  await h.page.mouse.up()
  h.check(
    'the editing overlay survives a null board value and its replacement',
    handlesAfterNull === 4 && marqueeAfterNull === 1,
    JSON.stringify({ handlesAfterNull, marqueeAfterNull }),
  )

  await reset()
  const panBefore = await board.evaluate((element) => (element as BoardElement).view.pan.x)
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.detach())
  await drag(h.page, { x: hostBox.x + hostBox.width / 2, y: hostBox.y + 600 }, -30, 0)
  const panAfter = await board.evaluate((element) => (element as BoardElement).view.pan.x)
  h.check('detaching board editing restores drag-to-pan', panAfter === panBefore - 30, JSON.stringify({ panBefore, panAfter }))

  await checkBoardEditingReset(h, h.page, board, first)
}
