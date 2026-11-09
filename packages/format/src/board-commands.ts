import { z } from 'zod'
import { BoardItem } from './board.ts'
import { Point } from './deck.ts'
import { TextDirection } from './direction.ts'

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

export const PlacementTarget = z.union([
  z.object({ beside: BoardEntityRef, side: z.enum(['start', 'end', 'above', 'below']) }),
  z.object({ free: z.literal(true) }),
  z.object({ at: Point }),
])
export type PlacementTarget = z.infer<typeof PlacementTarget>

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

const SectionAddCommand = z.object({
  type: z.literal('section-add'),
  id: z.string().optional(),
  title: z.string(),
  layout: z.enum(['auto', 'manual']).optional(),
  items: z.array(BoardItemRef).optional(),
  target: PlacementTarget.optional(),
})
const SectionRemoveCommand = z.object({ type: z.literal('section-remove'), section: BoardSectionRef, members: z.enum(['release', 'remove']) })
const SectionSetCommand = z
  .object({
    type: z.literal('section-set'),
    section: BoardSectionRef,
    title: z.string().optional(),
    layout: z.enum(['auto', 'manual']).optional(),
    items: z.array(BoardItemRef).optional(),
  })
  .refine((command) => command.title !== undefined || command.layout !== undefined || command.items !== undefined, {
    message: 'section-set requires at least one of title, layout or items',
  })

const LabelRef = z.object({ id: z.string() })
const LabelAddCommand = z.object({ type: z.literal('label-add'), id: z.string().optional(), text: z.string(), target: PlacementTarget.optional() })
const LabelRemoveCommand = z.object({ type: z.literal('label-remove'), labels: z.array(LabelRef).min(1) })
const LabelSetCommand = z
  .object({
    type: z.literal('label-set'),
    label: LabelRef,
    text: z.string().optional(),
    width: z.number().nullable().optional(),
    target: PlacementTarget.optional(),
  })
  .refine((command) => command.text !== undefined || command.width !== undefined || command.target !== undefined, {
    message: 'label-set requires at least one of text, width or target',
  })
const BoardSetCommand = z
  .object({ type: z.literal('board-set'), title: z.string().optional(), direction: TextDirection.optional() })
  .refine((command) => command.title !== undefined || command.direction !== undefined, {
    message: 'board-set requires at least one of title or direction',
  })

export const BoardCommand = z.discriminatedUnion('type', [
  ItemAddCommand,
  ItemRemoveCommand,
  ItemMoveCommand,
  ItemResizeCommand,
  ArrangeCommand,
  SectionAddCommand,
  SectionRemoveCommand,
  SectionSetCommand,
  LabelAddCommand,
  LabelRemoveCommand,
  LabelSetCommand,
  BoardSetCommand,
])
export type BoardCommand = z.infer<typeof BoardCommand>
export type BoardCommandOf<Type extends BoardCommand['type']> = Extract<BoardCommand, { type: Type }>
