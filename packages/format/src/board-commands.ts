import { z } from 'zod'
import { BoardItem } from './board.ts'
import { Point } from './deck.ts'

export const BoardItemRef = z.union([z.object({ id: z.string() }), z.object({ address: z.string().min(1) })])
export type BoardItemRef = z.infer<typeof BoardItemRef>

export const BoardSectionRef = z.union([z.object({ id: z.string() }), z.object({ title: z.string() })])
export type BoardSectionRef = z.infer<typeof BoardSectionRef>

export const BoardEntityRef = z.union([z.object({ id: z.string() }), z.object({ address: z.string().min(1) }), z.object({ title: z.string() })])
export type BoardEntityRef = z.infer<typeof BoardEntityRef>

const SectionTarget = z
  .object({
    section: BoardSectionRef,
    after: BoardItemRef.optional(),
    before: BoardItemRef.optional(),
  })
  .refine((target) => !(target.after && target.before), 'a section target cannot have both after and before; provide at most one ordering anchor')

export const BoardTarget = z.union([
  SectionTarget,
  z.object({ beside: BoardEntityRef, side: z.enum(['start', 'end', 'above', 'below']) }),
  z.object({ free: z.literal(true) }),
  z.object({ at: Point }),
])
export type BoardTarget = z.infer<typeof BoardTarget>

const ItemAddCommand = z.object({
  type: z.literal('item-add'),
  id: z.string().optional(),
  kind: BoardItem.shape.kind,
  address: z.string().min(1),
  width: z.number().optional(),
  target: BoardTarget,
})

const ItemRemoveCommand = z.object({ type: z.literal('item-remove'), items: z.array(BoardItemRef).min(1) })
const ItemMoveCommand = z.object({ type: z.literal('item-move'), items: z.array(BoardItemRef).min(1), target: BoardTarget })
const ItemResizeCommand = z.object({
  type: z.literal('item-resize'),
  item: BoardItemRef,
  width: z.number(),
  anchor: z.enum(['top-start', 'top-end', 'bottom-start', 'bottom-end']).optional(),
})
const ArrangeCommand = z.object({ type: z.literal('arrange'), section: BoardSectionRef.optional(), columns: z.number().int().positive().optional() })

export const BoardCommand = z.discriminatedUnion('type', [ItemAddCommand, ItemRemoveCommand, ItemMoveCommand, ItemResizeCommand, ArrangeCommand])
export type BoardCommand = z.infer<typeof BoardCommand>
export type BoardCommandOf<Type extends BoardCommand['type']> = Extract<BoardCommand, { type: Type }>
