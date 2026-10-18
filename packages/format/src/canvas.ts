import { z } from 'zod'
import { Box } from './deck.ts'
import { TextDirection } from './direction.ts'

const CanvasKind = z.enum(['deck', 'page', 'paper', 'book', 'image', 'shot'], {
  error: 'item kind is unknown; use deck, page, paper, book, image or shot',
})

export const CanvasItem = z.object({
  id: z.string(),
  kind: CanvasKind,
  address: z.string().min(1, 'item address is empty; provide a non-empty address'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive('item width is not positive; provide a width greater than zero'),
})
export type CanvasItem = z.infer<typeof CanvasItem>

export const CanvasLabel = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
})
export type CanvasLabel = z.infer<typeof CanvasLabel>

export const CanvasSection = z.object({
  id: z.string(),
  title: z.string(),
  rectangle: Box,
  items: z.array(z.string()),
})
export type CanvasSection = z.infer<typeof CanvasSection>

const CanvasShape = z.object({
  title: z.string(),
  direction: TextDirection,
  items: z.array(CanvasItem),
  labels: z.array(CanvasLabel),
  sections: z.array(CanvasSection),
})

export const Canvas = CanvasShape.superRefine((canvas, ctx) => {
  const ids = new Set<string>()
  const checkIds = (entries: { id: string }[], listName: 'items' | 'labels' | 'sections') => {
    entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [listName, index, 'id'],
          message: `id "${entry.id}" is duplicated across canvas items, labels and sections; use a unique id`,
        })
      }
      ids.add(entry.id)
    })
  }
  checkIds(canvas.items, 'items')
  checkIds(canvas.labels, 'labels')
  checkIds(canvas.sections, 'sections')

  const itemIds = new Set(canvas.items.map((item) => item.id))
  canvas.sections.forEach((section, sectionIndex) => {
    section.items.forEach((id, itemIndex) => {
      if (!itemIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'items', itemIndex],
          message: `section member "${id}" is not a canvas item id; use the id of an existing item`,
        })
      }
    })
  })
})
export type Canvas = z.infer<typeof Canvas>
export type CanvasInput = z.input<typeof Canvas>
