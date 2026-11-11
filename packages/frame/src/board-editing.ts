import {
  type ArrangeOptions,
  addItem,
  arrange,
  type Board,
  type BoardCommand,
  type BoardItem,
  boardFromDocument,
  DEFAULT_BOARD_ITEM_WIDTH,
  type Document,
  type DocumentBatch,
  type DocumentOp,
  defaultNewId,
  fingerprintDocument,
  type Point,
  provisionalShape,
  screenToBoard,
  settleBoard,
} from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import {
  adoptHostBoard,
  applyRemoteBoardEdit,
  type BoardEditQueueState,
  type BoardEditTransition,
  boardEditQueue,
  boardEditRefusal,
  detachBoardEditing,
  rejectBoardEdit,
  resolveBoardEdit,
} from './board-edit-policy.ts'
import { applyBoardOps, editBoardFromFrame } from './board-editing-command.ts'
import { BoardEditingInput } from './board-editing-input.ts'
import { renderLabelResizeHandle, renderResizeHandles } from './board-editing-overlay.ts'
import { type BoardEditingBridge, type BoardEditingHost, type BoardPointerDelegate, boardEditing } from './board-editing-seam.ts'
import {
  applyBoardTransition,
  applyEditingTransition,
  commitLiveTransition,
  initialBoardSettlement,
  redoTransition,
  undoTransition,
} from './board-editing-transition.ts'
import type { AddBoardItemInput, BoardEdit, BoardEditing, BoardEditingOptions } from './board-editing-types.ts'
import { BOARD_HISTORY_LIMIT } from './board-history.ts'
import { removeBoardEntities } from './board-removal.ts'
import { copyComputedBoardShapes } from './board-shape-cache.ts'
import { BoardTextEditing } from './board-text-editing.ts'
import { boardLabels } from './labels.ts'

export type { ComputedBoardShapes } from '@segnavia/format'
export type { AddBoardItemInput, BoardChange, BoardEdit, BoardEditing, BoardEditingOptions } from './board-editing-types.ts'
export { BOARD_HISTORY_LIMIT, DEFAULT_BOARD_ITEM_WIDTH }

class BoardEditingController implements BoardEditing, BoardPointerDelegate {
  private readonly enabled: Record<'move' | 'resize' | 'remove' | 'add' | 'arrange' | 'labelText' | 'labelResize' | 'sectionTitle', boolean>
  private bridge: BoardEditingBridge
  private state: BoardEditQueueState | null
  private readonly aborts = new Map<number, AbortController>()
  private runningId: number | null = null
  private nextId = 1
  private invalidated: BoardEditQueueState['invalidated'] = null
  private readonly input: BoardEditingInput
  private readonly labelEditor: BoardTextEditing
  private stopped = false

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly options: BoardEditingOptions,
  ) {
    this.enabled = {
      move: true,
      resize: true,
      remove: true,
      add: true,
      arrange: true,
      labelText: true,
      labelResize: true,
      sectionTitle: true,
      ...options.editors,
    }
    this.input = new BoardEditingInput(board, this.enabled, {
      current: () => (this.state ? boardFromDocument(this.state.value) : null),
      bridge: () => this.bridge,
      live: (value) => this.live(value),
      commit: (before, after, edit) => this.commitLive(before, after, edit),
      command: (before, commands, edit) => this.commitCommands(before, commands, edit),
      remove: () => this.remove(),
      undo: () => this.undo(),
      redo: () => this.redo(),
    })
    const initial = board.board
    this.state = initial ? boardEditQueue(initial) : null
    this.bridge = (board as SegnaviaBoard & BoardEditingHost)[boardEditing](this, this.hostValue)
    this.labelEditor = new BoardTextEditing(board, this.bridge, this.enabled, options.limits, (next, edit) => this.applyBoard(next, edit), this.renderHandles)
    board.addEventListener('segnavia-board-selection', this.renderHandles)
    board.addEventListener('segnavia-board-view', this.renderHandles)
    board.addEventListener('keyup', this.onKeyUp)
    this.renderHandles()
    queueMicrotask(() => this.settleInitial())
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
    this.labelEditor.detach()
    if (this.state) this.applyTransition(detachBoardEditing(this.state))
    this.bridge.detach()
    if (!this.state?.jobs.length) this.bridge.release()
  }

  add(input: AddBoardItemInput, at?: Point): string | undefined {
    const current = this.state ? boardFromDocument(this.state.value) : null
    if (!this.enabled.add || !current) return undefined
    const width = input.width ?? this.options.defaultWidth?.[input.kind] ?? DEFAULT_BOARD_ITEM_WIDTH
    const shape = provisionalShape(input.kind)
    const center = at ?? screenToBoard(this.bridge.view(), { x: this.board.clientWidth / 2, y: this.board.clientHeight / 2 })
    const item: BoardItem = {
      id: defaultNewId(),
      kind: input.kind,
      address: input.address,
      x: center.x - width / 2,
      y: center.y - (width * shape.height) / shape.width / 2,
      width,
    }
    // item-add cannot accept the provisional shape of a new unresolved address.
    const added = addItem(current, item)
    this.applyBoard(settleBoard(current, added, this.bridge.shapes(), [item.id]), { kind: 'add', ids: [item.id] })
    this.board.selection = [item.id]
    return item.id
  }

  remove(ids: readonly string[] = this.board.selection) {
    const current = this.state ? boardFromDocument(this.state.value) : null
    if (!this.enabled.remove || !current) return
    removeBoardEntities(current, ids, this.board, (removal) => this.applyCommands(current, removal.commands, { kind: 'remove', ids: removal.removed }))
  }

  arrange(options: ArrangeOptions) {
    const current = this.state ? boardFromDocument(this.state.value) : null
    if (!this.enabled.arrange || !current) return
    const next = arrange(current, this.bridge.shapes(), options)
    const ids = current.items.filter((item, index) => item.x !== next.items[index]?.x || item.y !== next.items[index]?.y).map((item) => item.id)
    // arrange cannot carry the public layout, gap, and section-padding options.
    this.applyBoard(
      settleBoard(
        current,
        next,
        this.bridge.shapes(),
        current.items.map((item) => item.id),
      ),
      { kind: 'arrange', ids },
    )
  }

  apply(ops: readonly DocumentOp[], label: string) {
    if (!this.state) return
    const transition = applyBoardOps(this.state, ops, label, this.bridge.measureLabel, this.bridge.document)
    if (transition.conflicts?.length) return this.refuseConflicts(transition.conflicts)
    this.applyTransition(transition)
  }

  command(commands: BoardCommand[], label: string) {
    const document = this.state?.value
    if (!document)
      return { ok: false as const, refusal: 'Board command refused: the board has no document. Set a board before running commands. Nothing was changed.' }
    const result = editBoardFromFrame(document, commands, this.bridge)
    if (result.ok) this.applyBoard(result.board, { kind: 'command', label, ids: result.changed.map((entity) => entity.id) })
    return result
  }

  shapes() {
    return copyComputedBoardShapes(this.bridge.computedShapes())
  }

  applyRemote(batch: DocumentBatch) {
    if (!this.state) return
    const transition = applyRemoteBoardEdit(this.state, batch)
    this.refuseConflicts(transition.conflicts)
    this.applyTransition(transition)
  }

  undo() {
    if (!this.state) return
    const result = undoTransition(this.state)
    if (!result) return
    this.board.focus()
    this.applyTransition(result.transition, result.selection)
  }

  redo() {
    if (!this.state) return
    const result = redoTransition(this.state)
    if (!result) return
    this.board.focus()
    this.applyTransition(result.transition, result.selection)
  }

  editLabel(id: string) {
    return this.labelEditor.editLabel(id)
  }

  pointerDown = (event: PointerEvent): boolean => {
    this.labelEditor.capture(event)
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

  private onKeyUp = (event: KeyboardEvent) => this.input.keyUp(event)

  private applyBoard(next: Board, edit: BoardEdit, recorded = true) {
    if (!this.state) return
    this.applyTransition(applyBoardTransition(this.state, this.bridge, next, edit, recorded))
  }

  private commitLive(before: Board, next: Board, edit: BoardEdit) {
    if (this.state) this.applyTransition(commitLiveTransition(this.state, this.bridge, before, next, edit))
  }

  private applyCommands(current: Board, commands: BoardCommand[], edit: BoardEdit): boolean {
    const result = editBoardFromFrame(this.bridge.document(current), commands, this.bridge)
    if (result.ok) this.applyBoard(result.board, edit)
    else this.dispatchError(edit, result.refusal)
    return result.ok
  }

  private commitCommands(before: Board, commands: BoardCommand[], edit: BoardEdit) {
    const result = editBoardFromFrame(this.bridge.document(before), commands, this.bridge)
    if (result.ok) this.commitLive(before, result.board, edit)
    else {
      this.bridge.setOptimistic(before)
      this.dispatchError(edit, result.refusal)
      this.renderHandles()
    }
  }

  private applyTransition(transition: BoardEditTransition, selection?: readonly string[]) {
    applyEditingTransition(
      {
        board: this.board,
        bridge: this.bridge,
        aborts: this.aborts,
        setState: (state) => {
          this.state = state
          this.nextId = state.nextId
          this.invalidated = state.invalidated
        },
        render: this.renderHandles,
        refreshLabelEditor: this.labelEditor.refresh,
        notifyHistory: () => this.notifyHistory(),
        run: (id) => void this.run(id),
      },
      transition,
      selection,
    )
  }

  private async run(id: number) {
    if (this.runningId !== null) return
    const job = this.state?.jobs.find((entry) => entry.id === id)
    const controller = this.aborts.get(id)
    if (!job || !controller) return
    this.runningId = id
    try {
      // One whole-document write keeps host persistence and undo on the same ordered seam.
      await this.options.change({
        board: job.after,
        before: job.before,
        batch: { base: fingerprintDocument(job.before), ops: [...job.ops] },
        edit: job.edit,
        signal: controller.signal,
      })
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

  private hostValue = (value: Document | null) => {
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
    this.labelEditor.refresh()
  }

  private live(value: Board) {
    this.bridge.setOptimistic(value)
    this.renderHandles()
    this.labelEditor.refresh()
  }

  private settleInitial() {
    const document = this.state?.value
    if (!document || this.stopped) return
    const current = boardFromDocument(document)
    const settled = initialBoardSettlement(current, this.bridge.measuredLabelSizes(), this.bridge.shapes())
    if (settled) this.applyBoard(settled, { kind: 'settle', ids: current.sections.map((section) => section.id) }, false)
  }

  private renderHandles = () => {
    if (this.labelEditor.active || this.board.selection.length !== 1) {
      renderResizeHandles(this.bridge.overlay, undefined, this.bridge.view(), undefined)
      renderLabelResizeHandle(this.bridge.overlay, undefined, this.bridge.view(), undefined, '')
      return
    }
    const value = this.bridge.value()
    const item = value?.items.find((entry) => entry.id === this.board.selection[0])
    const shape = item ? this.bridge.shapes().items[item.id] : undefined
    renderResizeHandles(this.bridge.overlay, this.enabled.resize ? item : undefined, this.bridge.view(), shape)
    const label = this.enabled.labelResize ? value?.labels.find((entry) => entry.id === this.board.selection[0]) : undefined
    const labelShape = label ? this.bridge.shapes().labels[label.id] : undefined
    renderLabelResizeHandle(this.bridge.overlay, label, this.bridge.view(), labelShape, boardLabels(this.board.labels).labelResize)
  }

  private notifyHistory() {
    this.board.dispatchEvent(
      new CustomEvent('segnavia-board-history', { detail: { canUndo: this.canUndo, canRedo: this.canRedo }, bubbles: true, composed: true }),
    )
  }

  private dispatchError(edit: BoardEdit, error: unknown) {
    this.board.dispatchEvent(new CustomEvent('segnavia-board-edit-error', { detail: { edit, error }, bubbles: true, composed: true }))
  }

  private refuseConflicts(conflicts: readonly DocumentOp[] | undefined) {
    if (!conflicts?.length) return
    throw new Error(boardEditRefusal(conflicts))
  }
}

export function attachBoardEditing(board: SegnaviaBoard, options: BoardEditingOptions): BoardEditing {
  return new BoardEditingController(board, options)
}
