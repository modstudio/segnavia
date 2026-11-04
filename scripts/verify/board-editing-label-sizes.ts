import type { Locator } from 'playwright-core'
import type { Harness } from './harness.ts'

interface DemoLabel {
  id: string
  text: string
  x: number
  y: number
  size?: { width: number; height: number }
}
interface DemoBoard {
  direction: 'ltr' | 'rtl'
  items: Array<{ id: string; x: number; y: number; width: number }>
  labels: DemoLabel[]
  sections: Array<{ id: string; rectangle: { x: number; y: number; width: number; height: number }; items: string[] }>
}
type BoardElement = HTMLElement & { board: DemoBoard }
type DemoWindow = typeof window & {
  hostBoard: DemoBoard
  attachBoardEditingForCheck(target: BoardElement): { editing: { detach(): void }; changes(): number }
}

export async function checkBoardEditingLabelSizes(h: Harness, board: Locator) {
  const attachChanges = await board.evaluate(async () => {
    const state = window as unknown as DemoWindow
    const changesFor = async (value: DemoBoard) => {
      const target = document.createElement('segnavia-board') as BoardElement
      target.style.cssText = 'position:fixed;inline-size:800px;block-size:600px;inset-inline-start:-2000px'
      document.body.append(target)
      target.board = value
      const check = state.attachBoardEditingForCheck(target)
      await new Promise((resolve) => setTimeout(resolve, 50))
      check.editing.detach()
      target.remove()
      return check.changes()
    }
    const settled = structuredClone(state.hostBoard)
    const stored = settled.labels.length > 0 && settled.labels.every((label) => label.size)
    const settledChanges = await changesFor(structuredClone(settled))
    const unsized = structuredClone(settled)
    if (unsized.labels[0]) delete unsized.labels[0].size
    const unsizedChanges = await changesFor(unsized)
    return { stored, settledChanges, unsizedChanges }
  })
  h.check(
    'attaching editing to a settled board with stored label sizes sends no settle change',
    attachChanges.stored && attachChanges.settledChanges === 0,
    JSON.stringify(attachChanges),
  )
  h.check('attaching editing to a board with one unsized label sends one settle change', attachChanges.unsizedChanges === 1, JSON.stringify(attachChanges))
}
