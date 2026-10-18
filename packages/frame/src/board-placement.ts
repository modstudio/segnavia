import { type BoardView, boardToScreen } from '@segnavia/format'

interface BoardPlacement {
  x: number
  y: number
  width?: number
  height?: number
}

export function placeBoardNode(node: HTMLElement, view: BoardView, placement: BoardPlacement) {
  const point = boardToScreen(view, placement)
  node.style.insetInlineStart = `${point.x}px`
  node.style.insetBlockStart = `${point.y}px`
  if (placement.width !== undefined) node.style.inlineSize = `${placement.width * view.zoom}px`
  if (placement.height !== undefined) node.style.blockSize = `${placement.height * view.zoom}px`
}
