import type { Locator } from 'playwright-core'
import { center, drag, settledBoxes, waitChanges } from './board-editing-actions.ts'
import type { DemoBoard, DemoChange, DemoDocument, DemoItem, DemoLabel } from './board-editing-types.ts'
import type { Harness } from './harness.ts'

type BoardElement = HTMLElement & {
  board: DemoDocument
  selection: readonly string[]
  view: { zoom: number; pan: { x: number; y: number }; viewport: { width: number; height: number } }
}
type DemoWindow = typeof window & {
  boardChanges: DemoChange[]
  hostBoard: DemoDocument
  openedItem?: DemoItem
  labelSelection?: { label?: DemoLabel; labels?: DemoLabel[] }
  boardValue(target: { board: DemoDocument }): DemoBoard
  setBoardValue(target: { board: DemoDocument }, value: DemoBoard): void
  boardEditing: { undo(): void }
}

function boxesMatch(
  first: { x: number; y: number; width: number; height: number } | null,
  second: { x: number; y: number; width: number; height: number } | null,
) {
  return Boolean(
    first &&
      second &&
      Math.abs(first.x - second.x) < 1 &&
      Math.abs(first.y - second.y) < 1 &&
      Math.abs(first.width - second.width) < 1 &&
      Math.abs(first.height - second.height) < 1,
  )
}

export async function checkBoardEditingLabels(h: Harness, board: Locator, original: DemoBoard) {
  const reset = async () => {
    await board.evaluate((element, source) => {
      const target = element as BoardElement
      const state = window as unknown as DemoWindow
      const next = structuredClone(source)
      next.direction = 'rtl'
      next.items = next.items.map((item, index) => (item.id === 'page' ? { ...item, x: 700, y: 0, width: 180 } : { ...item, x: 1_200 + index * 400, y: 0 }))
      next.labels = [
        { id: 'label', text: 'Latin label', x: 150, y: 260, width: 110 },
        { id: 'label-he', text: 'אוסף מקומי ארוך עם מילים רבות שנשברות לשורות', x: 430, y: 260, width: 140 },
      ]
      state.setBoardValue(target, next)
      target.selection = []
      target.view = { ...target.view, zoom: 1, pan: { x: 100, y: 150 } }
      state.boardChanges = []
      state.hostBoard = target.board
    }, original)
  }

  await reset()
  const hebrew = board.locator('[data-board-label="label-he"]')
  const handle = board.locator('[part~="label-resize-handle"]')
  await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    state.labelSelection = undefined
    element.addEventListener(
      'segnavia-board-selection',
      (event) => {
        state.labelSelection = (event as CustomEvent).detail
      },
      { once: true },
    )
  })
  await hebrew.click()
  await handle.waitFor({ state: 'visible' })
  const selected = await board.evaluate(() => (window as unknown as DemoWindow).labelSelection)
  h.check(
    'clicking a Hebrew label selects it and shows its resize handle',
    selected?.label?.id === 'label-he' && selected.labels?.length === 1 && (await handle.count()) === 1,
    JSON.stringify(selected),
  )
  const beforeBox = await hebrew.boundingBox()
  const beforeHandle = await handle.boundingBox()
  h.check(
    'a Hebrew label on an RTL board puts its resize handle on the left',
    Boolean(beforeBox && beforeHandle && Math.abs(beforeHandle.x + beforeHandle.width / 2 - beforeBox.x) < 1),
    JSON.stringify({ beforeBox, beforeHandle }),
  )
  await drag(h.page, await center(handle), 60, 0)
  await waitChanges(h.page, 1)
  const resized = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    return { label: state.boardValue(element as BoardElement).labels.find((label) => label.id === 'label-he') as DemoLabel, changes: state.boardChanges.length }
  })
  const resizedBox = await hebrew.boundingBox()
  h.check(
    'resizing an RTL label narrows and wraps it while keeping its right edge fixed in one change',
    resized.label.width === 80 &&
      resized.changes === 1 &&
      Boolean(beforeBox && resizedBox && Math.abs(beforeBox.x + beforeBox.width - resizedBox.x - resizedBox.width) < 1 && resizedBox.height > beforeBox.height),
    JSON.stringify({ beforeBox, resizedBox, resized }),
  )
  await handle.evaluate((element) => element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true })))
  await waitChanges(h.page, 2)
  const cleared = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    return state.boardValue(element as BoardElement).labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  const clearedBox = await hebrew.boundingBox()
  h.check(
    'double-clicking an RTL label handle clears its width and keeps its right edge fixed',
    cleared.width === undefined && Boolean(resizedBox && clearedBox && Math.abs(resizedBox.x + resizedBox.width - clearedBox.x - clearedBox.width) < 1),
    JSON.stringify({ resizedBox, clearedBox, cleared }),
  )

  await reset()
  const draggedBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  await drag(h.page, await center(hebrew), 30, 20)
  await waitChanges(h.page, 1)
  const draggedAfter = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const value = state.boardValue(element as BoardElement)
    return { label: value.labels.find((label) => label.id === 'label-he') as DemoLabel, changes: state.boardChanges.length }
  })
  h.check(
    'dragging a label by its own node commits one change',
    draggedAfter.changes === 1 && draggedAfter.label.x === draggedBefore.x + 30 && draggedAfter.label.y === draggedBefore.y + 20,
    JSON.stringify({ draggedBefore, draggedAfter }),
  )
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const draggedUndo = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  h.check(
    'one undo restores a label dragged by its own node',
    draggedUndo.x === draggedBefore.x && draggedUndo.y === draggedBefore.y,
    JSON.stringify({ draggedBefore, draggedUndo }),
  )

  await reset()
  const nudgedBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  await hebrew.click()
  await h.page.keyboard.press('ArrowRight')
  await waitChanges(h.page, 1)
  const nudgedAfter = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const value = state.boardValue(element as BoardElement)
    return { label: value.labels.find((label) => label.id === 'label-he') as DemoLabel, changes: state.boardChanges.length }
  })
  h.check(
    'clicking a label focuses the board so ArrowRight makes one move',
    nudgedAfter.changes === 1 && nudgedAfter.label.x === nudgedBefore.x + 1 && nudgedAfter.label.y === nudgedBefore.y,
    JSON.stringify({ nudgedBefore, nudgedAfter }),
  )
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const nudgedUndo = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  h.check(
    'one undo restores a label nudged after its own click',
    nudgedUndo.x === nudgedBefore.x && nudgedUndo.y === nudgedBefore.y,
    JSON.stringify({ nudgedBefore, nudgedUndo }),
  )

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['label']))
  const latin = board.locator('[data-board-label="label"]')
  const [latinBox, latinHandle] = await settledBoxes([latin, handle], 2_000)
  h.check(
    'an LTR label on an RTL board puts its resize handle on the right',
    Boolean(latinBox && latinHandle && Math.abs(latinHandle.x + latinHandle.width / 2 - latinBox.x - latinBox.width) < 1),
    JSON.stringify({ latinBox, latinHandle }),
  )

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['page', 'label-he']))
  const page = board.locator('[data-board-item="page"]')
  const mixedBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return { item: value.items.find((item) => item.id === 'page') as DemoItem, label: value.labels.find((label) => label.id === 'label-he') as DemoLabel }
  })
  await drag(h.page, await center(page), 30, 20)
  await waitChanges(h.page, 1)
  const mixedAfter = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const value = state.boardValue(element as BoardElement)
    return {
      item: value.items.find((item) => item.id === 'page') as DemoItem,
      label: value.labels.find((label) => label.id === 'label-he') as DemoLabel,
      changes: state.boardChanges.length,
    }
  })
  h.check(
    'one mixed drag change moves an item and a label together',
    mixedAfter.changes === 1 &&
      mixedAfter.item.x === mixedBefore.item.x + 30 &&
      mixedAfter.item.y === mixedBefore.item.y + 20 &&
      mixedAfter.label.x === mixedBefore.label.x + 30 &&
      mixedAfter.label.y === mixedBefore.label.y + 20,
    JSON.stringify({ mixedBefore, mixedAfter }),
  )
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const undone = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return { item: value.items.find((item) => item.id === 'page'), label: value.labels.find((label) => label.id === 'label-he') as DemoLabel }
  })
  h.check(
    'one undo restores both nodes from a mixed drag',
    undone.item?.x === mixedBefore.item.x && undone.label.x === mixedBefore.label.x,
    JSON.stringify(undone),
  )

  await reset()
  const oldHebrewText = await hebrew.textContent()
  await hebrew.dblclick()
  const editor = board.locator('[part~="label-editor"]')
  await editor.waitFor({ state: 'visible' })
  await h.page.keyboard.type(' חדשה')
  await h.page.keyboard.press('ControlOrMeta+Enter')
  await waitChanges(h.page, 1)
  const committed = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const label = state.boardValue(element as BoardElement).labels.find((entry) => entry.id === 'label-he') as DemoLabel
    return { label, changes: state.boardChanges.length }
  })
  h.check(
    'double-clicking a Hebrew label and pressing Mod+Enter commits one text change',
    committed.changes === 1 && committed.label.text === `${oldHebrewText} חדשה`,
    JSON.stringify(committed),
  )
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const editedUndo = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((entry) => entry.id === 'label-he') as DemoLabel
  })
  h.check('one undo restores the old Hebrew label text', editedUndo.text === oldHebrewText, JSON.stringify(editedUndo))

  await reset()
  await hebrew.dblclick()
  await editor.waitFor({ state: 'visible' })
  await h.page.keyboard.type(' בטשטוש')
  await h.page.locator('segnavia-board-list').click({ position: { x: 1, y: 1 } })
  await waitChanges(h.page, 1)
  const blurred = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const label = state.boardValue(element as BoardElement).labels.find((entry) => entry.id === 'label-he') as DemoLabel
    return { label, changes: state.boardChanges.length }
  })
  h.check(
    'leaving the label editor commits one text change',
    [blurred.changes === 1, blurred.label.text === `${oldHebrewText} בטשטוש`].every(Boolean),
    JSON.stringify(blurred),
  )
  await board.evaluate(() => (window as unknown as DemoWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const blurredUndo = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((entry) => entry.id === 'label-he') as DemoLabel
  })
  h.check('one undo restores text committed by blur', blurredUndo.text === oldHebrewText, JSON.stringify(blurredUndo))

  await reset()
  await hebrew.click()
  await board.evaluate(() => {
    const state = window as unknown as DemoWindow
    state.openedItem = undefined
  })
  await page.focus()
  await h.page.keyboard.press('Enter')
  const focusedItem = await board.evaluate(() => ({
    opened: (window as unknown as DemoWindow).openedItem?.id,
    editors: document.querySelector('segnavia-board')?.shadowRoot?.querySelectorAll('[part~="label-editor"]').length,
  }))
  h.check(
    'Enter on a focused item opens the item without opening the selected label editor',
    [focusedItem.opened === 'page', focusedItem.editors === 0].every(Boolean),
    JSON.stringify(focusedItem),
  )

  await reset()
  await hebrew.click()
  await h.page.keyboard.press('Enter')
  await editor.waitFor({ state: 'visible' })
  const handleWhileEditing = await handle.count()
  const beforeLineBreak = await editor.inputValue()
  await h.page.keyboard.press('Enter')
  const lineBreak = await board.evaluate((element) => ({
    changes: (window as unknown as DemoWindow).boardChanges.length,
    selected: (element as BoardElement).selection,
  }))
  const editorText = await editor.inputValue()
  await h.page.keyboard.press('Escape')
  await handle.waitFor({ state: 'visible' })
  h.check(
    'Enter opens the label editor without its resize handle, Enter inserts a line, and Escape restores the handle',
    editorText === `${beforeLineBreak}\n` &&
      lineBreak.changes === 0 &&
      lineBreak.selected[0] === 'label-he' &&
      handleWhileEditing === 0 &&
      (await handle.count()) === 1,
    JSON.stringify({ lineBreak, handleWhileEditing }),
  )
  await reset()
  await hebrew.dblclick()
  await editor.waitFor({ state: 'visible' })
  await h.page.keyboard.type(' draft')
  await h.page.keyboard.press('Escape')
  const escaped = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    return { label: state.boardValue(element as BoardElement).labels.find((entry) => entry.id === 'label-he') as DemoLabel, changes: state.boardChanges.length }
  })
  h.check('Escape cancels label text editing without a change', escaped.changes === 0 && escaped.label.text === oldHebrewText, JSON.stringify(escaped))

  await reset()
  await hebrew.dblclick()
  await editor.waitFor({ state: 'visible' })
  await editor.fill('')
  await h.page.keyboard.press('ControlOrMeta+Enter')
  const emptyCommit = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const value = state.boardValue(element as BoardElement)
    return { label: value.labels.find((entry) => entry.id === 'label-he') as DemoLabel | undefined, changes: state.boardChanges.length }
  })
  h.check(
    'committing empty label text makes no change and keeps the label',
    emptyCommit.changes === 0 && emptyCommit.label?.text === oldHebrewText,
    JSON.stringify(emptyCommit),
  )

  await reset()
  const shortcutBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((entry) => entry.id === 'label-he') as DemoLabel
  })
  await hebrew.dblclick()
  await editor.waitFor({ state: 'visible' })
  await h.page.keyboard.press('ArrowRight')
  await h.page.keyboard.press('Delete')
  const shortcutAfter = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    const value = state.boardValue(element as BoardElement)
    return {
      label: value.labels.find((entry) => entry.id === 'label-he') as DemoLabel | undefined,
      changes: state.boardChanges.length,
    }
  })
  h.check(
    'ArrowRight and Delete in the editor do not move or remove the label',
    shortcutAfter.changes === 0 && shortcutAfter.label?.x === shortcutBefore.x && shortcutAfter.label.y === shortcutBefore.y && (await editor.count()) === 1,
    JSON.stringify({ shortcutBefore, shortcutAfter }),
  )
  await h.page.keyboard.press('Escape')

  await reset()
  await hebrew.dblclick()
  await editor.waitFor({ state: 'visible' })
  const labelBox = await hebrew.boundingBox()
  const editorBox = await editor.boundingBox()
  const editorDirection = await editor.evaluate((element) => ({ attribute: element.getAttribute('dir'), computed: getComputedStyle(element).direction }))
  h.check(
    'the Hebrew label editor resolves RTL and sits over the label box',
    editorDirection.attribute === 'auto' && editorDirection.computed === 'rtl' && boxesMatch(labelBox, editorBox),
    JSON.stringify({ labelBox, editorBox, editorDirection }),
  )
  await h.page.keyboard.press('Escape')

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['label-he']))
  const cancelBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return value.labels.find((label) => label.id === 'label-he') as DemoLabel
  })
  const labelCenter = await center(hebrew)
  await h.page.mouse.move(labelCenter.x, labelCenter.y)
  await h.page.mouse.down()
  await h.page.mouse.move(labelCenter.x + 40, labelCenter.y + 20, { steps: 4 })
  await board.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, composed: true })))
  await h.page.mouse.up()
  const cancelAfter = await board.evaluate((element) => {
    const state = window as unknown as DemoWindow
    return {
      label: state.boardValue(element as BoardElement).labels.find((label) => label.id === 'label-he') as DemoLabel,
      changes: state.boardChanges.length,
    }
  })
  h.check(
    'pointercancel restores a live label drag without a history entry',
    cancelAfter.changes === 0 && cancelAfter.label.x === cancelBefore.x && cancelAfter.label.y === cancelBefore.y,
    JSON.stringify({ cancelBefore, cancelAfter }),
  )
}
