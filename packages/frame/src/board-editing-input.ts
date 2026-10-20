import {
  assignMembership,
  type Board,
  gridDropTarget,
  insertIntoGrid,
  makeRoom,
  moveItems,
  moveSection,
  type Point,
  removeFromGrid,
  screenToBoard,
  settleBoard,
} from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import type { BoardEdit } from './board-editing.ts'
import { marqueeItems, placeMarquee, renderDropMarker, resizedAtPointer } from './board-editing-overlay.ts'
import type { BoardEditingBridge, BoardInputDelegate } from './board-editing-seam.ts'
import { selectBoardItem } from './board-selection.ts'

type Gesture =
  | {
      kind: 'move'
      pointerId: number
      start: Point
      before: Board
      ids: string[]
      sectionId?: string
      itemId?: string
      base?: readonly string[]
      shift?: boolean
      dragged: boolean
    }
  | { kind: 'section'; pointerId: number; start: Point; before: Board; ids: string[]; sectionId: string; dragged: boolean }
  | { kind: 'marquee'; pointerId: number; start: Point; before: Board; base: readonly string[]; shift: boolean; node: HTMLElement; dragged: boolean }
  | { kind: 'resize'; pointerId: number; start: Point; before: Board; id: string; corner: string; dragged: boolean }
  | { kind: 'noop'; pointerId: number; start: Point; before: Board; dragged: boolean }

interface Callbacks {
  current(): Board | null
  bridge(): BoardEditingBridge
  live(value: Board): void
  commit(before: Board, after: Board, edit: BoardEdit): void
  remove(): void
  undo(): void
  redo(): void
}

export class BoardEditingInput implements BoardInputDelegate {
  private gesture: Gesture | null = null
  private spaceHeld = false

  constructor(
    private readonly board: SegnaviaBoard,
    private readonly enabled: Record<'move' | 'resize' | 'remove' | 'add' | 'arrange', boolean>,
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
    const handle = this.pathElement(event, 'resizeHandle')
    if (handle && this.enabled.resize) {
      const id = this.board.selection[0]
      return id
        ? { kind: 'resize', pointerId: event.pointerId, start: bridge.local(event), before: current, id, corner: handle.dataset.corner ?? '', dragged: false }
        : null
    }
    const sectionId = this.pathElement(event, 'boardSectionTitle')?.dataset.boardSectionTitle
    if (sectionId)
      return this.enabled.move
        ? { kind: 'section', pointerId: event.pointerId, start: bridge.local(event), before: current, ids: [], sectionId, dragged: false }
        : { kind: 'noop', pointerId: event.pointerId, start: bridge.local(event), before: current, dragged: false }
    const itemId = this.pathElement(event, 'boardItem')?.dataset.boardItem ?? this.pathElement(event, 'boardTitle')?.dataset.boardTitle
    if (itemId) return this.startMove(event, current, itemId)
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

  private startMove(event: PointerEvent, current: Board, itemId: string): Gesture {
    const base = [...this.board.selection]
    if (!base.includes(itemId)) this.board.selection = selectBoardItem(base, itemId, event.shiftKey)
    return {
      kind: 'move',
      pointerId: event.pointerId,
      start: this.callbacks.bridge().local(event),
      before: current,
      ids: [...this.board.selection],
      itemId,
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
      const moved = moveItems(gesture.before, gesture.ids, delta)
      this.callbacks.live(moved)
      const boardPoint = screenToBoard(bridge.view(), point)
      const assigned = assignMembership(moved, bridge.shapes(), gesture.ids, boardPoint, gesture.before.sections)
      const target = [...assigned.sections].reverse().find((section) => section.items.some((id) => gesture.ids.includes(id)))
      bridge.setDropTarget(target?.id)
      const drop = target?.layout === 'manual' ? undefined : target ? gridDropTarget(gesture.before, bridge.shapes(), target.id, boardPoint) : undefined
      renderDropMarker(bridge.overlay, gesture.before, target?.id, drop, bridge.view(), bridge.shapes())
    } else if (gesture.kind === 'section' && gesture.sectionId) this.callbacks.live(moveSection(gesture.before, gesture.sectionId, delta))
    else if (gesture.kind === 'marquee') this.updateMarquee(gesture, point)
    else if (gesture.kind === 'resize') {
      const shape = bridge.shapes().items[gesture.id]
      if (shape) {
        const resized = resizedAtPointer(gesture.before, gesture.id, gesture.corner, point, bridge.view(), shape)
        this.callbacks.live(resized)
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
    } else if (!gesture.dragged && gesture.kind === 'move' && gesture.itemId) this.finishClick(gesture)
    else if (gesture.dragged && gesture.kind !== 'noop') this.finishEdit(gesture, event)
    return true
  }

  private finishClick(gesture: Extract<Gesture, { kind: 'move' }>) {
    this.board.selection = selectBoardItem(gesture.base ?? [], gesture.itemId as string, gesture.shift ?? false)
  }

  private finishEdit(gesture: Exclude<Gesture, { kind: 'marquee' }>, event: PointerEvent) {
    const next = this.board.board
    if (!next) return
    const bridge = this.callbacks.bridge()
    if (gesture.kind === 'move' && this.enabled.move) {
      const point = bridge.local(event)
      const delta = { x: (point.x - gesture.start.x) / bridge.view().zoom, y: (point.y - gesture.start.y) / bridge.view().zoom }
      const moved = moveItems(gesture.before, gesture.ids, delta)
      const release = screenToBoard(bridge.view(), point)
      const assigned = assignMembership(moved, bridge.shapes(), gesture.ids, release, gesture.before.sections)
      const target = [...assigned.sections].reverse().find((section) => section.items.some((id) => gesture.ids.includes(id)))
      const drop = target?.layout === 'manual' ? undefined : target ? gridDropTarget(gesture.before, bridge.shapes(), target.id, release) : undefined
      const placed =
        target?.layout === 'manual' ? assigned : target && drop ? insertIntoGrid(assigned, target.id, gesture.ids, drop) : removeFromGrid(assigned, gesture.ids)
      this.callbacks.commit(gesture.before, settleBoard(gesture.before, placed, bridge.shapes(), gesture.ids), { kind: 'move', ids: gesture.ids })
    } else if (gesture.kind === 'section' && gesture.sectionId) {
      const members = gesture.before.sections.find((entry) => entry.id === gesture.sectionId)?.items ?? []
      this.callbacks.commit(gesture.before, makeRoom(next, bridge.shapes(), [gesture.sectionId]), {
        kind: 'move-section',
        ids: [gesture.sectionId, ...members],
      })
    } else if (gesture.kind === 'resize') {
      this.callbacks.commit(gesture.before, settleBoard(gesture.before, next, bridge.shapes(), [gesture.id]), { kind: 'resize', ids: [gesture.id] })
    }
  }

  pointerCancel(event: PointerEvent): boolean {
    if (!this.gesture || this.gesture.pointerId !== event.pointerId) return false
    this.cancel()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    if (this.pathElement(event, 'boardItemAction')) return false
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
      const movable = this.board.selection.filter((id) => !current.sections.some((section) => section.layout !== 'manual' && section.items.includes(id)))
      if (movable.length === 0) return true
      const moved = moveItems(current, movable, delta)
      this.callbacks.commit(current, settleBoard(current, moved, this.callbacks.bridge().shapes(), movable), {
        kind: 'move',
        ids: movable,
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
    const hit = marqueeItems(gesture.before, gesture.start, point, bridge.view(), bridge.shapes()).map((item) => item.id)
    this.board.selection = gesture.shift ? [...gesture.base, ...hit] : hit
  }

  private pathElement(event: Event, data: keyof DOMStringMap): HTMLElement | undefined {
    return event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && target.dataset[data] !== undefined)
  }
}
