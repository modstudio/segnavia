import { z } from 'zod'
import { Box } from './deck.ts'
import { TextDirection } from './direction.ts'
import { AssetKind } from './placement.ts'

const BoardKind = AssetKind

export const BoardItem = z.object({
  id: z.string(),
  kind: BoardKind,
  address: z.string().min(1, 'item address is empty; provide a non-empty address'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive('item width is not positive; provide a width greater than zero'),
})
export type BoardItem = z.infer<typeof BoardItem>

export const BoardLabel = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  size: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
})
export type BoardLabel = z.infer<typeof BoardLabel>

export const GridCell = z.object({
  id: z.string(),
  row: z.number(),
  column: z.number(),
})
export type GridCell = z.infer<typeof GridCell>

export const BoardSection = z.object({
  id: z.string(),
  title: z.string(),
  rectangle: Box,
  items: z.array(z.string()),
  layout: z.enum(['auto', 'manual']).optional(),
  cells: z.array(GridCell).optional(),
})
export type BoardSection = z.infer<typeof BoardSection>

export const BoardProperties = z.object({
  title: z.string(),
  direction: TextDirection,
})

const BoardShape = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null) return value
    const board = value as { items?: unknown; sections?: unknown }
    if (!Array.isArray(board.items)) return value
    return {
      ...board,
      items: board.items.map((item) =>
        typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'image' ? { ...item, kind: 'media' } : item,
      ),
      sections: Array.isArray(board.sections)
        ? board.sections.map((section) => {
            if (typeof section !== 'object' || section === null || !Array.isArray((section as { items?: unknown }).items)) return section
            const seen = new Set<unknown>()
            return {
              ...section,
              items: (section as { items: unknown[] }).items.filter((id) => {
                if (seen.has(id)) return false
                seen.add(id)
                return true
              }),
            }
          })
        : board.sections,
    }
  },
  BoardProperties.extend({
    items: z.array(BoardItem),
    labels: z.array(BoardLabel),
    sections: z.array(BoardSection),
  }),
)

export const Board = BoardShape.superRefine((board, ctx) => {
  const ids = new Set<string>()
  const checkIds = (entries: { id: string }[], listName: 'items' | 'labels' | 'sections') => {
    entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [listName, index, 'id'],
          message: `id "${entry.id}" is duplicated across board items, labels and sections; use a unique id`,
        })
      }
      ids.add(entry.id)
    })
  }
  checkIds(board.items, 'items')
  checkIds(board.labels, 'labels')
  checkIds(board.sections, 'sections')

  const itemsByAddress = new Map<string, (typeof board.items)[number]>()
  board.items.forEach((item, index) => {
    const shared = itemsByAddress.get(item.address)
    if (shared && shared.kind !== item.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['items', index, 'address'],
        message: `board items "${shared.id}" and "${item.id}" share address "${item.address}" with kinds ${shared.kind} and ${item.kind}; one address names one asset, so give each kind its own address`,
      })
    } else if (!shared) itemsByAddress.set(item.address, item)
  })

  const itemIds = new Set(board.items.map((item) => item.id))
  board.sections.forEach((section, sectionIndex) => {
    section.items.forEach((id, itemIndex) => {
      if (!itemIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'items', itemIndex],
          message: `section member "${id}" is not a board item id; use the id of an existing item`,
        })
      }
    })
    if (section.layout === 'manual' || !section.cells) return
    const members = new Set(section.items)
    const positions = new Set<string>()
    const cellIds = new Set<string>()
    section.cells.forEach((cell, cellIndex) => {
      const path = ['sections', sectionIndex, 'cells', cellIndex]
      if (!members.has(cell.id))
        ctx.addIssue({ code: 'custom', path, message: `section "${section.id}" cell "${cell.id}" is not a member; use the id of a section member` })
      if (!Number.isInteger(cell.row) || cell.row < 0 || !Number.isInteger(cell.column) || cell.column < 0)
        ctx.addIssue({
          code: 'custom',
          path,
          message: `section "${section.id}" cell "${cell.id}" has an invalid track index; use non-negative integer row and column indexes`,
        })
      const position = `${cell.row}:${cell.column}`
      if (positions.has(position))
        ctx.addIssue({
          code: 'custom',
          path,
          message: `section "${section.id}" cell "${cell.id}" shares position (${cell.row}, ${cell.column}); give every cell a unique position`,
        })
      positions.add(position)
      if (cellIds.has(cell.id))
        ctx.addIssue({
          code: 'custom',
          path,
          message: `section "${section.id}" cell "${cell.id}" is duplicated; provide exactly one cell for each member`,
        })
      cellIds.add(cell.id)
    })
    for (const id of section.items)
      if (!cellIds.has(id))
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'cells'],
          message: `section "${section.id}" member "${id}" has no cell; add one cell for every member`,
        })
  })
})
export type Board = z.infer<typeof Board>
export type BoardInput = z.input<typeof Board>
