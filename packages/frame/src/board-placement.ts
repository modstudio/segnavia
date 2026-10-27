import { type BoardItem, type BoardView, boardToScreen, itemHeight } from '@segnavia/format'

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

export function placeBoardItem(
  node: HTMLElement,
  view: BoardView,
  item: BoardItem,
  shape: { width: number; height: number } | undefined,
  titles: { place(id: string, view: BoardView, item: BoardItem): void },
): void {
  placeBoardNode(node, view, {
    x: item.x,
    y: item.y,
    width: item.width,
    height: itemHeight(item, shape as { width: number; height: number }),
  })
  titles.place(item.id, view, item)
}
