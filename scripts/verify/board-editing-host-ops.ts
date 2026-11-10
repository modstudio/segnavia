import type { Locator } from 'playwright-core'
import { waitChanges } from './board-editing-actions.ts'
import type { DemoChange, DemoDocument } from './board-editing-types.ts'
import type { Harness } from './harness.ts'

interface HostOpsWindow extends Window {
  boardChanges: DemoChange[]
  boardValue(target: { board: DemoDocument | null }): { items: Array<{ id: string; x: number }>; labels: Array<{ id: string; text: string }> }
  boardEditing: {
    canUndo: boolean
    canRedo: boolean
    apply(ops: unknown[], label: string): void
    command(
      commands: unknown[],
      label: string,
    ): { ok: boolean; refusal?: string; board?: { labels: Array<{ id: string; size?: { width: number; height: number } }> } }
    shapes(): { shapes: { items: Record<string, unknown>; labels: Record<string, unknown> }; provisional: string[]; estimated: string[] }
    applyRemote(batch: { base: string; ops: unknown[] }): void
    undo(): void
  }
  fingerprintBoardDocument(document: DemoDocument): string
}

type BoardElement = HTMLElement & { board: DemoDocument | null }

export async function checkBoardEditingHostOps(h: Harness, board: Locator, reset: () => Promise<void>) {
  await reset()
  const hostApplyBefore = await board.evaluate((element) => {
    const state = window as unknown as HostOpsWindow
    const item = state.boardValue(element as BoardElement).items.find((entry) => entry.id === 'page') as { x: number }
    state.boardEditing.apply([{ type: 'setFields', id: 'page', fields: { x: item.x + 13 }, unset: [], prior: { x: item.x }, priorAbsent: [] }], 'host check')
    return item.x
  })
  await waitChanges(h.page, 1)
  const hostApplied = await board.evaluate((element) => {
    const state = window as unknown as HostOpsWindow
    return {
      x: state.boardValue(element as BoardElement).items.find((entry) => entry.id === 'page')?.x,
      kind: state.boardChanges[0]?.edit.kind,
      canUndo: state.boardEditing.canUndo,
    }
  })
  await board.evaluate(() => (window as unknown as HostOpsWindow).boardEditing.undo())
  await waitChanges(h.page, 2)
  const hostUndone = await board.evaluate((element) => {
    const state = window as unknown as HostOpsWindow
    return state.boardValue(element as BoardElement).items.find((entry) => entry.id === 'page')?.x
  })
  const remote = await board.evaluate((element) => {
    const state = window as unknown as HostOpsWindow
    const value = element as BoardElement
    const document = value.board as DemoDocument
    const label = state.boardValue(value).labels.find((entry) => entry.id === 'label') as { id: string; text: string }
    state.boardEditing.applyRemote({
      base: state.fingerprintBoardDocument(document),
      ops: [{ type: 'setFields', id: label.id, fields: { text: 'Remote label' }, unset: [], prior: { text: label.text }, priorAbsent: [] }],
    })
    return {
      text: state.boardValue(value).labels.find((entry) => entry.id === 'label')?.text,
      changes: state.boardChanges.length,
      canRedo: state.boardEditing.canRedo,
    }
  })
  h.check(
    'BoardEditing.apply joins undo and applyRemote updates the board without sending a change',
    hostApplied.x === hostApplyBefore + 13 &&
      hostApplied.kind === 'apply' &&
      hostApplied.canUndo &&
      hostUndone === hostApplyBefore &&
      remote.text === 'Remote label' &&
      remote.changes === 2 &&
      remote.canRedo,
    JSON.stringify({ hostApplyBefore, hostApplied, hostUndone, remote }),
  )

  const command = await board.evaluate(() => {
    const state = window as unknown as HostOpsWindow
    const before = state.boardChanges.length
    const shapes = state.boardEditing.shapes()
    const result = state.boardEditing.command(
      [{ type: 'label-add', id: 'command-label', text: 'Measured command label', target: { at: { x: 900, y: 500 } } }],
      'add command label',
    )
    const refused = state.boardEditing.command([{ type: 'label-set', label: { id: 'missing' }, text: 'No' }], 'refused command')
    return {
      before,
      shapeItems: Object.keys(shapes.shapes.items).length,
      result,
      refused,
      immediateChanges: state.boardChanges.length,
      canUndo: state.boardEditing.canUndo,
    }
  })
  await waitChanges(h.page, 3)
  const commandChange = await board.evaluate(() => {
    const state = window as unknown as HostOpsWindow
    return {
      changes: state.boardChanges.length,
      edit: state.boardChanges[2]?.edit,
      errors: (window as unknown as { boardEditErrors: unknown[] }).boardEditErrors.length,
    }
  })
  h.check(
    'BoardEditing.command uses canvas shapes, measures a new label, and refuses atomically',
    command.shapeItems > 0 &&
      command.result.ok &&
      !!command.result.board?.labels.find((label) => label.id === 'command-label')?.size &&
      !command.refused.ok &&
      command.immediateChanges === command.before &&
      command.canUndo &&
      commandChange.changes === 3 &&
      commandChange.edit?.kind === 'command' &&
      commandChange.errors === 0,
    JSON.stringify({ command, commandChange }),
  )
}
