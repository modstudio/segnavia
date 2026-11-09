import { z } from 'zod'
import { BoardItem, BoardLabel, BoardSection } from './board.ts'
import { Slide } from './deck.ts'
import { Numbering } from './folio.ts'
import { PageBody } from './page.ts'
import { PlacementShape } from './placement.ts'
import { SlotKey } from './slots.ts'

export const NodeId = z.object({ id: z.string().optional() })

export const FlowNode = NodeId.extend({
  type: z.literal('flow'),
  html: z.string(),
  title: z.string().optional(),
  runningHead: z.string().optional(),
})

export const PageNode = NodeId.extend({
  type: z.literal('page'),
  body: PageBody.optional(),
  template: z.string().min(1).optional(),
  regions: z.record(z.string(), z.string()).optional(),
})

export const SlideNode = Slide.omit({ id: true }).extend({ type: z.literal('slide'), id: z.string().optional() })

export const PlacedNode = PlacementShape.extend({ type: z.literal('placed'), id: z.string().optional() })

export const RecordNode = NodeId.extend({
  type: z.literal('record'),
  title: z.string().optional(),
  template: z.string().min(1),
  values: z.record(SlotKey, z.string()),
})

export const BoardItemNode = BoardItem.omit({ id: true }).extend({ type: z.literal('item'), id: z.string().optional() })
export const LabelNode = BoardLabel.omit({ id: true }).extend({ type: z.literal('label'), id: z.string().optional() })
export const BoardSectionNode = BoardSection.omit({ id: true }).extend({ type: z.literal('boardSection'), id: z.string().optional() })

export const DivisionName = z.enum(['front', 'body', 'end'])
export const DivisionSettings = z.object({ numbering: Numbering.optional() })

export type FlowNode = z.infer<typeof FlowNode>
export type PageNode = z.infer<typeof PageNode>
export type SlideNode = z.infer<typeof SlideNode>
export type PlacedNode = z.infer<typeof PlacedNode>
export type RecordNode = z.infer<typeof RecordNode>
export type BoardItemNode = z.infer<typeof BoardItemNode>
export type LabelNode = z.infer<typeof LabelNode>
export type BoardSectionNode = z.infer<typeof BoardSectionNode>
