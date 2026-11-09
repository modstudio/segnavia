import type { Board, BoardLabel, BoardShapes, BoardView, Document, MeasuredSize, Point } from '@segnavia/format'

export interface BoardPointerDelegate {
  pointerDown(event: PointerEvent): boolean
  pointerMove(event: PointerEvent): boolean
  pointerUp(event: PointerEvent): boolean
  pointerCancel(event: PointerEvent): boolean
  keyDown(event: KeyboardEvent): boolean
}

export interface BoardEditingBridge {
  overlay: HTMLElement
  value(): Board | null
  view(): BoardView
  shapes(): BoardShapes
  labelShape(label: BoardLabel): MeasuredSize
  document(board: Board): Document
  local(event: { clientX: number; clientY: number }): Point
  setDropTarget(id?: string): void
  setOptimistic(board: Board): void
  detach(): void
  release(): void
}

export const boardEditing = Symbol.for('@segnavia/frame/board-editing')
export type BoardEditingHostValue = (board: Document | null) => void

export interface BoardEditingHost {
  [boardEditing](delegate: BoardPointerDelegate, hostValue: BoardEditingHostValue): BoardEditingBridge
}

interface BridgeParts {
  host: HTMLElement
  surface: HTMLElement
  value(): Board | null
  view(): BoardView
  shapes(): BoardShapes
  labelShape(label: BoardLabel): MeasuredSize
  document(board: Board): Document
  local(event: { clientX: number; clientY: number }): Point
  setDropTarget(id?: string): void
  optimistic(board: Board): void
  detachInput(): void
  release(): void
}

export function createBoardEditingBridge(parts: BridgeParts): BoardEditingBridge {
  const overlay = document.createElement('div')
  overlay.part.add('editing-overlay')
  parts.surface.append(overlay)
  parts.host.toggleAttribute('data-editing', true)
  return {
    overlay,
    value: parts.value,
    view: parts.view,
    shapes: parts.shapes,
    labelShape: parts.labelShape,
    document: parts.document,
    local: parts.local,
    setDropTarget: parts.setDropTarget,
    setOptimistic: parts.optimistic,
    detach: () => {
      parts.detachInput()
      parts.setDropTarget()
      overlay.remove()
      parts.host.toggleAttribute('data-editing', false)
    },
    release: parts.release,
  }
}
