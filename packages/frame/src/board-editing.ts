import { type ArrangeOptions, addItem, arrange, type Board, type BoardItem, type Point, removeItems, screenToBoard, settleBoard } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import {
  adoptHostBoard,
  applyBoardEdit,
  BOARD_HISTORY_LIMIT,
  type BoardEditQueueState,
  type BoardEditTransition,
  boardEditQueue,
  detachBoardEditing,
  redoBoardEdit,
  rejectBoardEdit,
  resolveBoardEdit,
  undoBoardEdit,
} from './board-edit-policy.ts'
import { BoardEditingInput } from './board-editing-input.ts'
import { renderResizeHandles } from './board-editing-overlay.ts'
import { type BoardEditingBridge, type BoardEditingHost, type BoardInputDelegate, boardEditing } from './board-editing-seam.ts'
import { provisionalShape } from './board-policy.ts'

export const DEFAULT_BOARD_ITEM_WIDTH = 320
export { BOARD_HISTORY_LIMIT }

type EditKind = 'move' | 'resize' | 'remove' | 'add' | 'arrange' | 'move-section'
type DirectBoardEdit = { [Kind in EditKind]: { kind: Kind; ids: string[] } }[EditKind]
type HistoryBoardEdit = { [Kind in 'undo' | 'redo']: { kind: Kind; edit: BoardEdit } }['undo' | 'redo']
export type BoardEdit = DirectBoardEdit | HistoryBoardEdit
export interface BoardChange {
  board: Board
  edit: BoardEdit
  signal: AbortSignal
}
export interface AddBoardItemInput {
  kind: BoardItem['kind']
  address: string
  width?: number
}
export interface BoardEditingOptions {
  change(change: BoardChange): Promise<void>
  editors?: Partial<Record<'move' | 'resize' | 'remove' | 'add' | 'arrange', boolean>>
  defaultWidth?: Partial<Record<BoardItem['kind'], number>>
}
export interface BoardEditing {
  detach(): void
  add(input: AddBoardItemInput, at?: Point): string | undefined
  remove(ids?: readonly string[]): void
  arrange(options: ArrangeOptions): void
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}

class BoardEditingController implements BoardEditing, BoardInputDelegate {
  private readonly enabled: Record<'move' | 'resize' | 'remove' | 'add' | 'arrange', boolean>
  private bridge: BoardEditingBridge
  private state: BoardEditQueueState | null
  private readonly aborts = new Map<number, AbortController>()
  private runningId: number | null = null
  private nextId = 1
  private invalidated: BoardEditQueueState['invalidated'] = null
  private readonly input: BoardEditingInput
  private stopped = false

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly options: BoardEditingOptions,
  ) {
    this.enabled = { move: true, resize: true, remove: true, add: true, arrange: true, ...options.editors }
    this.input = new BoardEditingInput(board, this.enabled, {
      current: () => this.state?.value ?? null,
      bridge: () => this.bridge,
      live: (value) => this.live(value),
      commit: (before, after, edit) => this.commitLive(before, after, edit),
      remove: () => this.remove(),
      undo: () => this.undo(),
      redo: () => this.redo(),
    })
    const initial = board.board
    this.state = initial ? boardEditQueue(initial) : null
    this.bridge = (board as SegnaviaBoard & BoardEditingHost)[boardEditing](this, this.hostValue)
    board.addEventListener('segnavia-board-selection', this.renderHandles)
    board.addEventListener('segnavia-board-view', this.renderHandles)
    board.addEventListener('keyup', this.onKeyUp)
    this.renderHandles()
  }

  get canUndo() {
    return (this.state?.undo.length ?? 0) > 0
  }
  get canRedo() {
    return (this.state?.redo.length ?? 0) > 0
  }

  detach() {
    if (this.stopped) return
    this.stopped = true
    this.input.cancel()
    this.board.removeEventListener('segnavia-board-selection', this.renderHandles)
    this.board.removeEventListener('segnavia-board-view', this.renderHandles)
    this.board.removeEventListener('keyup', this.onKeyUp)
    if (this.state) this.applyTransition(detachBoardEditing(this.state))
    this.bridge.detach()
    if (!this.state?.jobs.length) this.bridge.release()
  }

  add(input: AddBoardItemInput, at?: Point): string | undefined {
    const current = this.state?.value
    if (!this.enabled.add || !current) return undefined
    const width = input.width ?? this.options.defaultWidth?.[input.kind] ?? DEFAULT_BOARD_ITEM_WIDTH
    const shape = provisionalShape(input.kind)
    const center = at ?? screenToBoard(this.bridge.view(), { x: this.board.clientWidth / 2, y: this.board.clientHeight / 2 })
    const item: BoardItem = {
      id: crypto.randomUUID(),
      kind: input.kind,
      address: input.address,
      x: center.x - width / 2,
      y: center.y - (width * shape.height) / shape.width / 2,
      width,
    }
    const added = addItem(current, item)
    this.apply(settleBoard(current, added, this.bridge.shapes(), [item.id]), { kind: 'add', ids: [item.id] })
    this.board.selection = [item.id]
    return item.id
  }

  remove(ids: readonly string[] = this.board.selection) {
    const current = this.state?.value
    const existing = ids.filter((id) => current?.items.some((item) => item.id === id))
    if (!this.enabled.remove || !current || existing.length === 0) return
    this.board.selection = this.board.selection.filter((id) => !existing.includes(id))
    const removed = removeItems(current, existing)
    this.apply(settleBoard(current, removed, this.bridge.shapes(), existing), { kind: 'remove', ids: existing })
    this.board.focus()
  }

  arrange(options: ArrangeOptions) {
    const current = this.state?.value
    if (!this.enabled.arrange || !current) return
    const next = arrange(current, this.bridge.shapes(), options)
    const ids = current.items.filter((item, index) => item.x !== next.items[index]?.x || item.y !== next.items[index]?.y).map((item) => item.id)
    this.apply(
      settleBoard(
        current,
        next,
        this.bridge.shapes(),
        current.items.map((item) => item.id),
      ),
      { kind: 'arrange', ids },
    )
  }

  undo() {
    if (!this.state) return
    const entry = this.state.undo.at(-1)
    if (!entry) return
    this.board.focus()
    this.applyTransition(undoBoardEdit(this.state), this.existingIds(entry.edit, entry.before))
  }

  redo() {
    if (!this.state) return
    const entry = this.state.redo.at(-1)
    if (!entry) return
    this.board.focus()
    this.applyTransition(redoBoardEdit(this.state), this.existingIds(entry.edit, entry.after))
  }

  pointerDown(event: PointerEvent): boolean {
    return this.input.pointerDown(event)
  }

  pointerMove(event: PointerEvent): boolean {
    return this.input.pointerMove(event)
  }

  pointerUp(event: PointerEvent): boolean {
    return this.input.pointerUp(event)
  }

  pointerCancel(event: PointerEvent): boolean {
    return this.input.pointerCancel(event)
  }

  keyDown(event: KeyboardEvent): boolean {
    return this.input.keyDown(event)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    this.input.keyUp(event)
  }

  private apply(next: Board, edit: BoardEdit) {
    if (!this.state) return
    this.applyTransition(applyBoardEdit(this.state, next, edit))
  }

  private commitLive(before: Board, next: Board, edit: BoardEdit) {
    this.bridge.setOptimistic(before)
    if (this.state) this.state = { ...this.state, value: before }
    this.apply(next, edit)
  }

  private applyTransition(transition: BoardEditTransition, selection?: readonly string[]) {
    this.state = transition.state
    this.nextId = this.state.nextId
    this.invalidated = this.state.invalidated
    for (const job of this.state.jobs) if (!this.aborts.has(job.id)) this.aborts.set(job.id, new AbortController())
    for (const id of transition.effects.abort) {
      this.aborts.get(id)?.abort()
      this.aborts.delete(id)
    }
    if (transition.effects.show) this.bridge.setOptimistic(transition.effects.show)
    if (selection) this.board.selection = selection
    if (transition.effects.historyChanged) this.notifyHistory()
    if (transition.effects.error)
      this.board.dispatchEvent(new CustomEvent('segnavia-board-edit-error', { detail: transition.effects.error, bubbles: true, composed: true }))
    this.renderHandles()
    if (transition.effects.run) void this.run(transition.effects.run.id)
  }

  private async run(id: number) {
    if (this.runningId !== null) return
    const job = this.state?.jobs.find((entry) => entry.id === id)
    const controller = this.aborts.get(id)
    if (!job || !controller) return
    this.runningId = id
    try {
      // One whole-document write keeps host persistence and undo on the same ordered seam.
      await this.options.change({ board: job.after, edit: job.edit, signal: controller.signal })
      if (this.state) this.applyTransition(resolveBoardEdit(this.state, id))
    } catch (error) {
      const transition = this.state ? rejectBoardEdit(this.state, id, error) : null
      if (transition?.effects.error) this.applyTransition(transition)
      else {
        if (transition) this.applyTransition(transition)
        this.dispatchError(job.edit, error)
      }
    } finally {
      this.aborts.delete(id)
      if (this.invalidated?.id === id) this.invalidated = null
      this.runningId = null
      const next = this.state?.jobs[0]
      if (next) void this.run(next.id)
      else if (this.stopped) this.bridge.release()
    }
  }

  private hostValue = (value: Board | null) => {
    this.input.cancel(false)
    if (value && this.state) this.applyTransition(adoptHostBoard(this.state, value))
    else if (value) this.state = boardEditQueue(value, this.nextId, this.invalidated)
    else {
      const hadHistory = this.canUndo || this.canRedo
      if (this.state) {
        this.nextId = this.state.nextId
        const running = this.runningId === null ? undefined : this.state.jobs.find((job) => job.id === this.runningId)
        this.invalidated = this.state.invalidated ?? (running ? { id: running.id, edit: running.edit } : null)
      }
      for (const controller of this.aborts.values()) controller.abort()
      this.aborts.clear()
      this.state = null
      if (hadHistory) this.notifyHistory()
    }
    this.renderHandles()
  }

  private live(value: Board) {
    this.bridge.setOptimistic(value)
    this.renderHandles()
  }

  private renderHandles = () => {
    if (!this.enabled.resize || this.board.selection.length !== 1) {
      renderResizeHandles(this.bridge.overlay, undefined, this.bridge.view(), undefined)
      return
    }
    const item = this.board.board?.items.find((entry) => entry.id === this.board.selection[0])
    const shape = item ? this.bridge.shapes().items[item.id] : undefined
    renderResizeHandles(this.bridge.overlay, item, this.bridge.view(), shape)
  }

  private existingIds(edit: BoardEdit, value: Board): string[] {
    const ids = edit.kind === 'undo' || edit.kind === 'redo' ? this.existingIds(edit.edit, value) : edit.ids
    const present = new Set(value.items.map((item) => item.id))
    return ids.filter((id) => present.has(id))
  }

  private notifyHistory() {
    this.board.dispatchEvent(
      new CustomEvent('segnavia-board-history', { detail: { canUndo: this.canUndo, canRedo: this.canRedo }, bubbles: true, composed: true }),
    )
  }

  private dispatchError(edit: BoardEdit, error: unknown) {
    this.board.dispatchEvent(new CustomEvent('segnavia-board-edit-error', { detail: { edit, error }, bubbles: true, composed: true }))
  }
}

export function attachBoardEditing(board: SegnaviaBoard, options: BoardEditingOptions): BoardEditing {
  return new BoardEditingController(board, options)
}
