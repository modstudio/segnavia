import { z } from 'zod'
import { Box } from './deck.ts'
import { TextDirection } from './direction.ts'

const BoardKind = z.enum(['deck', 'page', 'paper', 'book', 'image', 'shot'], {
  error: 'item kind is unknown; use deck, page, paper, book, image or shot',
})

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
})
export type BoardLabel = z.infer<typeof BoardLabel>

export const BoardSection = z.object({
  id: z.string(),
  title: z.string(),
  rectangle: Box,
  items: z.array(z.string()),
  layout: z.enum(['auto', 'manual']).optional(),
  rows: z.array(z.array(z.string().nullable())).optional(),
})
export type BoardSection = z.infer<typeof BoardSection>

const BoardShape = z.object({
  title: z.string(),
  direction: TextDirection,
  items: z.array(BoardItem),
  labels: z.array(BoardLabel),
  sections: z.array(BoardSection),
})

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
    if (section.rows) {
      section.rows.forEach((row, rowIndex) => {
        if (row.at(-1) === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', sectionIndex, 'rows', rowIndex],
            message: `section "${section.id}" row ${rowIndex} ends in null; remove trailing empty cells`,
          })
        }
      })
      const rowItems = section.rows.flat().filter((id): id is string => id !== null)
      const length = Math.max(section.items.length, rowItems.length)
      for (let index = 0; index < length; index += 1) {
        if (section.items[index] === rowItems[index]) continue
        const id = section.items[index] ?? rowItems[index] ?? '(missing)'
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'rows'],
          message: `section "${section.id}" rows disagree with items at "${id}"; make rows contain every item exactly once in row order`,
        })
        break
      }
    }
  })
})
export type Board = z.infer<typeof Board>
export type BoardInput = z.input<typeof Board>
