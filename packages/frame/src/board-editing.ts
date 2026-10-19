import { type ArrangeOptions, addItem, arrange, type Board, type BoardItem, type Point, removeItems, screenToBoard } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { adoptHostBoard, type BoardEditQueueState, enqueueBoardEdit, rejectBoardEdit, resolveBoardEdit } from './board-edit-policy.ts'
import { BoardEditingInput } from './board-editing-input.ts'
import { renderResizeHandles } from './board-editing-overlay.ts'
import { type BoardEditingBridge, type BoardEditingHost, type BoardInputDelegate, boardEditing } from './board-editing-seam.ts'
import { provisionalShape } from './board-policy.ts'

export const DEFAULT_BOARD_ITEM_WIDTH = 320
export const BOARD_HISTORY_LIMIT = 100

type EditKind = 'move' | 'resize' | 'remove' | 'add' | 'arrange' | 'move-section'
type DirectBoardEdit = { [Kind in EditKind]: { kind: Kind; ids: string[] } }[EditKind]
type HistoryBoardEdit = { [Kind in 'undo' | 'redo']: { kind: Kind; edit: BoardEdit } }['undo' | 'redo']
export type BoardEdit = DirectBoardEdit | HistoryBoardEdit
export interface BoardChange {
  board: Board
  edit: BoardEdit
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

interface HistoryEntry {
  before: Board
  after: Board
  edit: BoardEdit
}
interface QueueJob {
  id: number
  generation: number
  change: BoardChange
  undoBefore: HistoryEntry[]
  redoBefore: HistoryEntry[]
}
class BoardEditingController implements BoardEditing, BoardInputDelegate {
  private readonly enabled: Record<'move' | 'resize' | 'remove' | 'add' | 'arrange', boolean>
  private bridge: BoardEditingBridge
  private state: BoardEditQueueState | null
  private undoEntries: HistoryEntry[] = []
  private redoEntries: HistoryEntry[] = []
  private jobs: QueueJob[] = []
  private running = false
  private nextId = 1
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
    this.state = initial ? { value: initial, pending: [], generation: 0 } : null
    this.bridge = (board as SegnaviaBoard & BoardEditingHost)[boardEditing](this, this.hostValue)
    board.addEventListener('segnavia-board-selection', this.renderHandles)
    board.addEventListener('segnavia-board-view', this.renderHandles)
    board.addEventListener('keyup', this.onKeyUp)
    this.renderHandles()
  }

  get canUndo() {
    return this.undoEntries.length > 0
  }
  get canRedo() {
    return this.redoEntries.length > 0
  }

  detach() {
    if (this.stopped) return
    this.stopped = true
    this.input.cancel()
    this.board.removeEventListener('segnavia-board-selection', this.renderHandles)
    this.board.removeEventListener('segnavia-board-view', this.renderHandles)
    this.board.removeEventListener('keyup', this.onKeyUp)
    this.bridge.detach()
    if (this.jobs.length === 0) this.bridge.release()
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
    this.board.selection = [item.id]
    this.apply(addItem(current, item), { kind: 'add', ids: [item.id] })
    return item.id
  }

  remove(ids: readonly string[] = this.board.selection) {
    const current = this.state?.value
    const existing = ids.filter((id) => current?.items.some((item) => item.id === id))
    if (!this.enabled.remove || !current || existing.length === 0) return
    this.board.selection = this.board.selection.filter((id) => !existing.includes(id))
    this.apply(removeItems(current, existing), { kind: 'remove', ids: existing })
  }

  arrange(options: ArrangeOptions) {
    const current = this.state?.value
    if (!this.enabled.arrange || !current) return
    const next = arrange(current, this.bridge.shapes(), options)
    const ids = current.items.filter((item, index) => item.x !== next.items[index]?.x || item.y !== next.items[index]?.y).map((item) => item.id)
    this.apply(next, { kind: 'arrange', ids })
  }

  undo() {
    const entry = this.undoEntries.at(-1)
    if (!entry) return
    const undoBefore = [...this.undoEntries]
    const redoBefore = [...this.redoEntries]
    this.undoEntries.pop()
    this.redoEntries.push(entry)
    this.notifyHistory(undoBefore.length > 0, redoBefore.length > 0)
    this.board.selection = this.existingIds(entry.edit, entry.before)
    this.queue(entry.before, { kind: 'undo', edit: entry.edit }, undoBefore, redoBefore)
  }

  redo() {
    const entry = this.redoEntries.at(-1)
    if (!entry) return
    const undoBefore = [...this.undoEntries]
    const redoBefore = [...this.redoEntries]
    this.redoEntries.pop()
    this.undoEntries.push(entry)
    this.notifyHistory(undoBefore.length > 0, redoBefore.length > 0)
    this.board.selection = this.existingIds(entry.edit, entry.after)
    this.queue(entry.after, { kind: 'redo', edit: entry.edit }, undoBefore, redoBefore)
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
    const current = this.state?.value
    if (!current) return
    const undoBefore = [...this.undoEntries]
    const redoBefore = [...this.redoEntries]
    this.undoEntries.push({ before: current, after: next, edit })
    if (this.undoEntries.length > BOARD_HISTORY_LIMIT) this.undoEntries.shift()
    this.redoEntries = []
    this.notifyHistory(undoBefore.length > 0, redoBefore.length > 0)
    this.queue(next, edit, undoBefore, redoBefore)
  }

  private commitLive(before: Board, next: Board, edit: BoardEdit) {
    this.bridge.setOptimistic(before)
    if (this.state) this.state = { ...this.state, value: before }
    this.apply(next, edit)
  }

  private queue(next: Board, edit: BoardEdit, undoBefore: HistoryEntry[], redoBefore: HistoryEntry[]) {
    if (!this.state) return
    const id = this.nextId++
    this.state = enqueueBoardEdit(this.state, edit, next, id)
    this.bridge.setOptimistic(next)
    this.renderHandles()
    this.jobs.push({ id, generation: this.state.generation, change: { board: next, edit }, undoBefore, redoBefore })
    void this.runQueue()
  }

  private async runQueue() {
    if (this.running) return
    this.running = true
    while (this.jobs[0]) {
      const job = this.jobs[0]
      try {
        // One whole-document write keeps host persistence and undo on the same ordered seam.
        await this.options.change(job.change)
        if (this.state) this.state = resolveBoardEdit(this.state, job.id)
        this.jobs.shift()
      } catch (error) {
        const pending = this.state?.pending.some((entry) => entry.id === job.id) ?? false
        if (this.state) this.state = rejectBoardEdit(this.state, job.id)
        this.jobs = []
        if (pending && this.state) {
          this.undoEntries = job.undoBefore
          this.redoEntries = job.redoBefore
          this.bridge.setOptimistic(this.state.value)
          this.notifyHistory(true, true)
        }
        this.board.dispatchEvent(new CustomEvent('segnavia-board-edit-error', { detail: { edit: job.change.edit, error }, bubbles: true, composed: true }))
      }
    }
    this.running = false
    if (this.stopped) this.bridge.release()
  }

  private hostValue = (value: Board | null) => {
    this.input.cancel(false)
    this.state = value ? (this.state ? adoptHostBoard(this.state, value) : { value, pending: [], generation: 0 }) : null
    if (this.running) this.jobs = this.jobs.slice(0, 1)
    else this.jobs = []
    const hadUndo = this.canUndo
    const hadRedo = this.canRedo
    this.undoEntries = []
    this.redoEntries = []
    this.notifyHistory(hadUndo, hadRedo)
    this.renderHandles()
    if (this.stopped) this.bridge.release()
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

  private notifyHistory(previousUndo: boolean, previousRedo: boolean) {
    if (previousUndo === this.canUndo && previousRedo === this.canRedo) return
    this.board.dispatchEvent(
      new CustomEvent('segnavia-board-history', { detail: { canUndo: this.canUndo, canRedo: this.canRedo }, bubbles: true, composed: true }),
    )
  }
}

export function attachBoardEditing(board: SegnaviaBoard, options: BoardEditingOptions): BoardEditing {
  return new BoardEditingController(board, options)
}
