import type { Board, BoardShapes, BoardView, Point } from '@segnavia/format'

export interface BoardInputDelegate {
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
  local(event: { clientX: number; clientY: number }): Point
  setOptimistic(board: Board): void
  detach(): void
  release(): void
}

export const boardEditing = Symbol.for('@segnavia/frame/board-editing')

export interface BoardEditingHost {
  [boardEditing](delegate: BoardInputDelegate, hostValue: (board: Board | null) => void): BoardEditingBridge
}

interface BridgeParts {
  host: HTMLElement
  surface: HTMLElement
  value(): Board | null
  view(): BoardView
  shapes(): BoardShapes
  local(event: { clientX: number; clientY: number }): Point
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
    local: parts.local,
    setOptimistic: parts.optimistic,
    detach: () => {
      parts.detachInput()
      overlay.remove()
      parts.host.toggleAttribute('data-editing', false)
    },
    release: parts.release,
  }
}
