import { Board, type BoardItem } from './board.ts'
import type { Point } from './deck.ts'

export const MIN_BOARD_ITEM_WIDTH = 16

export type BoardItemAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function moveItems(board: Board, ids: readonly string[], delta: Point): Board {
  const moved = new Set(ids)
  return {
    ...board,
    items: board.items.map((item) => (moved.has(item.id) ? { ...item, x: item.x + delta.x, y: item.y + delta.y } : item)),
  }
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
