import type { Locator } from 'playwright-core'
import { center, drag, waitChanges } from './board-editing-actions.ts'
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
  boardValue(target: { board: DemoDocument }): DemoBoard
  setBoardValue(target: { board: DemoDocument }, value: DemoBoard): void
  boardEditing: { undo(): void }
}

export async function checkBoardEditingLabels(h: Harness, board: Locator, original: DemoBoard) {
  const reset = async () => {
    await board.evaluate((element, source) => {
      const target = element as BoardElement
      const state = window as unknown as DemoWindow
      const next = structuredClone(source)
      next.direction = 'rtl'
      next.items = next.items.map((item) => (item.id === 'page' ? { ...item, x: 700, y: 0, width: 180 } : item))
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
  await board.evaluate((element) => ((element as BoardElement).selection = ['label-he']))
  const hebrew = board.locator('[data-board-label="label-he"]')
  const handle = board.locator('[part~="label-resize-handle"]')
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
  h.check('double-clicking the label handle clears its authored width in one change', cleared.width === undefined, JSON.stringify(cleared))

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['label']))
  const latin = board.locator('[data-board-label="label"]')
  const latinBox = await latin.boundingBox()
  const latinHandle = await handle.boundingBox()
  h.check(
    'an LTR label on an RTL board puts its resize handle on the right',
    Boolean(latinBox && latinHandle && Math.abs(latinHandle.x + latinHandle.width / 2 - latinBox.x - latinBox.width) < 1),
    JSON.stringify({ latinBox, latinHandle }),
  )

  await reset()
  await board.evaluate((element) => ((element as BoardElement).selection = ['page', 'label-he']))
  const mixedBefore = await board.evaluate((element) => {
    const value = (window as unknown as DemoWindow).boardValue(element as BoardElement)
    return { item: value.items.find((item) => item.id === 'page') as DemoItem, label: value.labels.find((label) => label.id === 'label-he') as DemoLabel }
  })
  await drag(h.page, await center(hebrew), 30, 20)
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
