import { Board, type BoardItem, type BoardLabel, LABEL_MIN_WIDTH } from './board.ts'
import { labelDirection, labelXForWidth } from './board-geometry.ts'
import type { Point } from './deck.ts'

export const MIN_BOARD_ITEM_WIDTH = LABEL_MIN_WIDTH

export type BoardItemAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function moveItems(board: Board, ids: readonly string[], delta: Point): Board {
  const moved = new Set(ids)
  return {
    ...board,
    items: board.items.map((item) => (moved.has(item.id) ? { ...item, x: item.x + delta.x, y: item.y + delta.y } : item)),
  }
}

export function moveBoardNodes(board: Board, ids: readonly string[], delta: Point): Board {
  const moved = moveItems(board, ids, delta)
  const selected = new Set(ids)
  return {
    ...moved,
    labels: moved.labels.map((label) => (selected.has(label.id) ? { ...label, x: label.x + delta.x, y: label.y + delta.y } : label)),
  }
}

export function withLabelWidth(label: BoardLabel, width: number | undefined): BoardLabel {
  const { size: _size, width: _width, ...unmeasured } = label
  return width === undefined ? unmeasured : { ...unmeasured, width }
}

export function resizeLabel(board: Board, id: string, edgeX: number, currentWidth: number): Board {
  const label = board.labels.find((entry) => entry.id === id)
  if (!label) return board
  const direction = labelDirection(label)
  const inlineStart = direction === 'rtl' ? label.x + currentWidth : label.x
  const requested = direction === 'rtl' ? inlineStart - edgeX : edgeX - inlineStart
  const width = Math.max(LABEL_MIN_WIDTH, requested)
  const resized = { ...withLabelWidth(label, width), x: labelXForWidth(label, currentWidth, width) }
  return { ...board, labels: board.labels.map((entry) => (entry.id === id ? resized : entry)) }
}

export function moveSection(board: Board, sectionId: string, delta: Point): Board {
  const section = board.sections.find((entry) => entry.id === sectionId)
  if (!section) return board
  const moved = moveItems(board, section.items, delta)
  return {
    ...moved,
    sections: moved.sections.map((entry) =>
      entry.id === sectionId ? { ...entry, rectangle: { ...entry.rectangle, x: entry.rectangle.x + delta.x, y: entry.rectangle.y + delta.y } } : entry,
    ),
  }
}

export function resizeItem(board: Board, id: string, width: number, anchor: BoardItemAnchor, heightAt: (width: number) => number): Board {
  const nextWidth = Math.max(MIN_BOARD_ITEM_WIDTH, width)
  return {
    ...board,
    items: board.items.map((item) => {
      if (item.id !== id) return item
      const oldHeight = heightAt(item.width)
      const newHeight = heightAt(nextWidth)
      return {
        ...item,
        width: nextWidth,
        x: anchor.endsWith('right') ? item.x + item.width - nextWidth : item.x,
        y: anchor.startsWith('bottom') ? item.y + oldHeight - newHeight : item.y,
      }
    }),
  }
}

export function removeItems(board: Board, ids: readonly string[]): Board {
  const removed = new Set(ids)
  return {
    ...board,
    items: board.items.filter((item) => !removed.has(item.id)),
    sections: board.sections.map((section) => ({ ...section, items: section.items.filter((id) => !removed.has(id)) })),
  }
}

export function addItem(board: Board, item: BoardItem): Board {
  return Board.parse({ ...board, items: [...board.items, item] })
}
