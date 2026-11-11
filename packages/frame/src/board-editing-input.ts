import {
  assignMembership,
  type Board,
  type BoardCommand,
  boardNodesInRectangle,
  fitTouchedSections,
  gridDropTarget,
  insertIntoGrid,
  makeRoom,
  moveBoardNodes,
  moveSection,
  type Point,
  removeFromGrid,
  resizeLabel,
  screenToBoard,
  settleBoard,
} from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { labelResizeReleaseCommand, resizeReleaseCommand } from './board-editing-command.ts'
import { placeMarquee, renderDropMarker, resizedAtPointer } from './board-editing-overlay.ts'
import type { BoardEditingBridge, BoardPointerDelegate } from './board-editing-seam.ts'
import type { BoardEdit, BoardEditorFlags } from './board-editing-types.ts'
import { boardPathElement } from './board-event-path.ts'
import { selectBoardNode } from './board-selection.ts'

type Gesture =
  | {
      kind: 'move'
      pointerId: number
      start: Point
      before: Board
      ids: string[]
      sectionId?: string
      nodeId: string
      base?: readonly string[]
      shift?: boolean
      dragged: boolean
    }
  | { kind: 'section'; pointerId: number; start: Point; before: Board; sectionId: string; base: readonly string[]; shift: boolean; dragged: boolean }
  | { kind: 'marquee'; pointerId: number; start: Point; before: Board; base: readonly string[]; shift: boolean; node: HTMLElement; dragged: boolean }
  | { kind: 'resize'; pointerId: number; start: Point; before: Board; id: string; corner: string; dragged: boolean }
  | { kind: 'label-resize'; pointerId: number; start: Point; before: Board; id: string; currentWidth: number; dragged: boolean }
  | { kind: 'noop'; pointerId: number; start: Point; before: Board; dragged: boolean }

interface Callbacks {
  current(): Board | null
  bridge(): BoardEditingBridge
  live(value: Board): void
  commit(before: Board, after: Board, edit: BoardEdit): void
  command(before: Board, commands: BoardCommand[], edit: BoardEdit): void
  remove(): void
  undo(): void
  redo(): void
}

export class BoardEditingInput implements BoardPointerDelegate {
  private gesture: Gesture | null = null
  private spaceHeld = false

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly enabled: BoardEditorFlags,
    private readonly callbacks: Callbacks,
  ) {}

  pointerDown(event: PointerEvent): boolean {
    if (event.pointerType === 'touch' || event.button !== 0 || this.spaceHeld) return false
    const current = this.callbacks.current()
    if (!current) return false
    this.gesture = this.startGesture(event, current)
    if (!this.gesture) return false
    this.board.setPointerCapture(event.pointerId)
    event.preventDefault()
    return true
  }

  private startGesture(event: PointerEvent, current: Board): Gesture | null {
    const bridge = this.callbacks.bridge()
    const labelHandle = boardPathElement(event, 'labelResizeHandle')
    if (labelHandle) {
      if (!this.enabled.labelResize) return null
      const id = labelHandle.dataset.labelResizeHandle
      const currentWidth = id ? bridge.shapes().labels[id]?.width : undefined
      return id && currentWidth
        ? { kind: 'label-resize', pointerId: event.pointerId, start: bridge.local(event), before: current, id, currentWidth, dragged: false }
        : null
    }
    const handle = boardPathElement(event, 'resizeHandle')
    if (handle && this.enabled.resize) {
      const id = this.board.selection[0]
      return id
        ? { kind: 'resize', pointerId: event.pointerId, start: bridge.local(event), before: current, id, corner: handle.dataset.corner ?? '', dragged: false }
        : null
    }
    const sectionId = boardPathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle
    if (sectionId)
      return {
        kind: 'section',
        pointerId: event.pointerId,
        start: bridge.local(event),
        before: current,
        sectionId,
        base: [...this.board.selection],
        shift: event.shiftKey,
        dragged: false,
      }
    const nodeId =
      boardPathElement(event, 'boardItem')?.dataset.boardItem ??
      boardPathElement(event, 'boardTitle')?.dataset.boardTitle ??
      boardPathElement(event, 'boardLabel')?.dataset.boardLabel
    if (nodeId) return this.startMove(event, current, nodeId)
    const node = document.createElement('div')
    node.part.add('marquee')
    bridge.overlay.append(node)
    return {
      kind: 'marquee',
      pointerId: event.pointerId,
      start: bridge.local(event),
      before: current,
      base: [...this.board.selection],
      shift: event.shiftKey,
      node,
      dragged: false,
    }
  }

  private startMove(event: PointerEvent, current: Board, nodeId: string): Gesture {
    const base = [...this.board.selection]
    if (!base.includes(nodeId)) this.board.selection = selectBoardNode(base, nodeId, event.shiftKey)
    return {
      kind: 'move',
      pointerId: event.pointerId,
      start: this.callbacks.bridge().local(event),
      before: current,
      ids: [...this.board.selection],
      nodeId,
      base,
      shift: event.shiftKey,
      dragged: false,
    }
  }

  pointerMove(event: PointerEvent): boolean {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return false
    const bridge = this.callbacks.bridge()
    const point = bridge.local(event)
    if (!gesture.dragged && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <= 4) return true
    gesture.dragged = true
    const delta = { x: (point.x - gesture.start.x) / bridge.view().zoom, y: (point.y - gesture.start.y) / bridge.view().zoom }
    if (gesture.kind === 'move' && this.enabled.move) {
      const moved = moveBoardNodes(gesture.before, gesture.ids, delta)
      const itemIds = gesture.ids.filter((id) => gesture.before.items.some((item) => item.id === id))
      this.callbacks.live(fitTouchedSections(gesture.before, moved, bridge.shapes(), itemIds))
      const boardPoint = screenToBoard(bridge.view(), point)
      const assigned = assignMembership(moved, bridge.shapes(), gesture.ids, boardPoint, gesture.before.sections)
      const target = [...assigned.sections].reverse().find((section) => section.items.some((id) => gesture.ids.includes(id)))
      bridge.setDropTarget(target?.id)
      const drop = target?.layout === 'manual' ? undefined : target ? gridDropTarget(gesture.before, bridge.shapes(), target.id, boardPoint) : undefined
      renderDropMarker(bridge.overlay, gesture.before, target?.id, drop, bridge.view(), bridge.shapes())
    } else if (gesture.kind === 'section' && gesture.sectionId && this.enabled.move) this.callbacks.live(moveSection(gesture.before, gesture.sectionId, delta))
    else if (gesture.kind === 'marquee') this.updateMarquee(gesture, point)
    else if (gesture.kind === 'label-resize' && this.enabled.labelResize) {
      const edge = screenToBoard(bridge.view(), point).x
      this.callbacks.live(resizeLabel(gesture.before, gesture.id, edge, gesture.currentWidth))
    } else if (gesture.kind === 'resize') {
      const shape = bridge.shapes().items[gesture.id]
      if (shape) {
        const resized = resizedAtPointer(gesture.before, gesture.id, gesture.corner, point, bridge.view(), shape)
        this.callbacks.live(fitTouchedSections(gesture.before, resized, bridge.shapes(), [gesture.id]))
      }
    }
    event.preventDefault()
    return true
  }

  pointerUp(event: PointerEvent): boolean {
    const gesture = this.gesture
    if (!gesture || gesture.pointerId !== event.pointerId) return false
    this.gesture = null
    this.callbacks.bridge().setDropTarget()
    renderDropMarker(this.callbacks.bridge().overlay, undefined, undefined, undefined, this.callbacks.bridge().view(), this.callbacks.bridge().shapes())
    if (gesture.kind === 'marquee') {
      gesture.node.remove()
      if (!gesture.dragged) this.board.selection = []
    } else if (!gesture.dragged && gesture.kind === 'move') this.finishClick(gesture)
    else if (!gesture.dragged && gesture.kind === 'section') this.board.selection = selectBoardNode(gesture.base, gesture.sectionId, gesture.shift)
    else if (gesture.dragged && gesture.kind !== 'noop') this.finishEdit(gesture, event)
    return true
  }

  private finishClick(gesture: Extract<Gesture, { kind: 'move' }>) {
    this.board.selection = selectBoardNode(gesture.base ?? [], gesture.nodeId, gesture.shift ?? false)
  }

  private finishEdit(gesture: Exclude<Gesture, { kind: 'marquee' }>, event: PointerEvent) {
    const next = this.callbacks.bridge().value()
    if (!next) return
    const bridge = this.callbacks.bridge()
    if (gesture.kind === 'move' && this.enabled.move) {
      const point = bridge.local(event)
      const delta = { x: (point.x - gesture.start.x) / bridge.view().zoom, y: (point.y - gesture.start.y) / bridge.view().zoom }
      const moved = moveBoardNodes(gesture.before, gesture.ids, delta)
      const itemIds = gesture.ids.filter((id) => gesture.before.items.some((item) => item.id === id))
      const release = screenToBoard(bridge.view(), point)
      const withoutGridPlacement = removeFromGrid(moved, bridge.shapes(), itemIds)
      const assigned = assignMembership(withoutGridPlacement, bridge.shapes(), itemIds, release, gesture.before.sections)
      const target = [...assigned.sections].reverse().find((section) => section.items.some((id) => itemIds.includes(id)))
      const drop = target?.layout === 'manual' ? undefined : target ? gridDropTarget(gesture.before, bridge.shapes(), target.id, release) : undefined
      const placed = target && target.layout !== 'manual' && drop ? insertIntoGrid(moved, bridge.shapes(), target.id, itemIds, drop) : assigned
      // item-move's point target cannot keep the drag offset apart from the drop point.
      this.callbacks.commit(gesture.before, settleBoard(gesture.before, placed, bridge.shapes(), gesture.ids), { kind: 'move', ids: gesture.ids })
    } else if (gesture.kind === 'section' && gesture.sectionId && this.enabled.move) {
      const members = gesture.before.sections.find((entry) => entry.id === gesture.sectionId)?.items ?? []
      // BoardCommand has no target that can place a section rectangle.
      this.callbacks.commit(gesture.before, makeRoom(next, bridge.shapes(), [gesture.sectionId]), {
        kind: 'move-section',
        ids: [gesture.sectionId, ...members],
      })
    } else if (gesture.kind === 'resize') {
      this.finishCommand(gesture.before, resizeReleaseCommand(next, gesture.id, gesture.corner), { kind: 'resize', ids: [gesture.id] })
    } else if (gesture.kind === 'label-resize' && this.enabled.labelResize) {
      this.finishCommand(gesture.before, labelResizeReleaseCommand(next, gesture.id), { kind: 'resize', ids: [gesture.id] })
    }
  }

  private finishCommand(before: Board, command: BoardCommand | undefined, edit: BoardEdit) {
    if (command) this.callbacks.command(before, [command], edit)
    else this.callbacks.live(before)
  }

  pointerCancel(event: PointerEvent): boolean {
    if (!this.gesture || this.gesture.pointerId !== event.pointerId) return false
    this.cancel()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    if (boardPathElement(event, 'boardItemAction')) return false
    if (event.key === ' ') {
      this.spaceHeld = true
      return false
    }
    if (!this.handleKey(event)) return false
    event.preventDefault()
    return true
  }

  private handleKey(event: KeyboardEvent): boolean {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (event.shiftKey) this.callbacks.redo()
      else this.callbacks.undo()
      return true
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      this.callbacks.redo()
      return true
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.enabled.remove && this.board.selection.length) {
      this.callbacks.remove()
      return true
    }
    return this.moveByKey(event)
  }

  private moveByKey(event: KeyboardEvent): boolean {
    if (!this.enabled.move || !this.board.selection.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false
    const amount = event.shiftKey ? 10 : 1
    const delta = {
      x: event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
      y: event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0,
    }
    const current = this.callbacks.current()
    if (current) {
      const selectedSections = current.sections.filter((section) => this.board.selection.includes(section.id))
      const sectionMembers = new Set(selectedSections.flatMap((section) => section.items))
      const movable = this.board.selection.filter(
        (id) =>
          !current.sections.some((section) => section.layout !== 'manual' && section.items.includes(id)) &&
          !current.sections.some((section) => section.id === id),
      )
      if (movable.length === 0 && selectedSections.length === 0) return true
      let moved = current
      for (const section of selectedSections) moved = moveSection(moved, section.id, delta)
      moved = moveBoardNodes(
        moved,
        movable.filter((id) => !sectionMembers.has(id)),
        delta,
      )
      // item-move cannot nudge without reassigning membership.
      this.callbacks.commit(current, settleBoard(current, moved, this.callbacks.bridge().shapes(), [...movable, ...sectionMembers]), {
        kind: selectedSections.length ? 'move-section' : 'move',
        ids: [...selectedSections.map((section) => section.id), ...movable, ...sectionMembers],
      })
    }
    return true
  }

  keyUp(event: KeyboardEvent) {
    if (event.key === ' ') this.spaceHeld = false
  }

  cancel(restore = true) {
    const gesture = this.gesture
    this.gesture = null
    if (!gesture) return
    this.callbacks.bridge().setDropTarget()
    renderDropMarker(this.callbacks.bridge().overlay, undefined, undefined, undefined, this.callbacks.bridge().view(), this.callbacks.bridge().shapes())
    if (gesture.kind === 'marquee') gesture.node.remove()
    else if (restore && gesture.kind !== 'noop') this.callbacks.bridge().setOptimistic(gesture.before)
  }

  private updateMarquee(gesture: Extract<Gesture, { kind: 'marquee' }>, point: Point) {
    const bridge = this.callbacks.bridge()
    placeMarquee(gesture.node, gesture.start, point)
    const start = screenToBoard(bridge.view(), gesture.start)
    const end = screenToBoard(bridge.view(), point)
    const hit = boardNodesInRectangle(gesture.before, bridge.shapes(), {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    })
    this.board.selection = gesture.shift ? [...new Set([...gesture.base, ...hit])] : hit
  }
}
