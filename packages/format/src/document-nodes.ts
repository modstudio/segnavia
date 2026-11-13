import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { discriminatedNodeUnion } from './document-node-discriminator.ts'
import { ContentsNode, SectionFields } from './document-nodes-book.ts'
import {
  BoardItemNode,
  BoardSectionNode,
  DivisionName,
  DivisionSettings,
  FlowNode,
  LabelNode,
  PageNode as PageNodeSchema,
  PlacedNode,
  RecordNodeBase,
  SlideNode,
} from './document-nodes-common.ts'
import type { ParentRules } from './parent-rules.ts'
import { parentRules } from './parent-rules.ts'

export interface DivisionNode {
  type: 'division'
  id?: string
  name: z.infer<typeof DivisionName>
  settings?: z.infer<typeof DivisionSettings>
  children: DocumentNode[]
}

export interface PartNode {
  type: 'part'
  id?: string
  name: string
  title?: string
  html?: string
  contents: boolean
  opens?: 'recto' | 'verso' | 'any'
  parentRules?: ParentRules
  parents?: unknown
  children: DocumentNode[]
}

type SectionFieldValues = z.infer<z.ZodObject<typeof SectionFields>>

export interface SectionNode extends SectionFieldValues {
  type: 'section'
  id?: string
  template?: string
  children: DocumentNode[]
}

export type RecordNode = z.infer<typeof RecordNodeBase> & { children?: DocumentNode[] }

export type DocumentNode =
  | DivisionNode
  | PartNode
  | SectionNode
  | z.infer<typeof FlowNode>
  | z.infer<typeof PageNodeSchema>
  | z.infer<typeof SlideNode>
  | z.infer<typeof PlacedNode>
  | z.infer<typeof ContentsNode>
  | RecordNode
  | z.infer<typeof BoardItemNode>
  | z.infer<typeof LabelNode>
  | z.infer<typeof BoardSectionNode>

export type DocumentNodePath = Array<string | number>

export function collectRecords(nodes: DocumentNode[], path: DocumentNodePath = ['children']): Array<{ node: RecordNode; path: DocumentNodePath }> {
  return nodes.flatMap((node, index) => {
    const nodePath = [...path, index]
    const own = node.type === 'record' ? [{ node, path: nodePath }] : []
    return 'children' in node && node.children !== undefined ? [...own, ...collectRecords(node.children, [...nodePath, 'children'])] : own
  })
}

export const DivisionNodeFields = {
  type: z.literal('division'),
  id: z.string().optional(),
  name: DivisionName,
  settings: DivisionSettings.optional(),
  children: z.lazy(() => z.array(DocumentNode)),
}
const DivisionNodeSchema = closedObject(DivisionNodeFields)
export const DivisionNode = DivisionNodeSchema as z.ZodType<DivisionNode>

export const PartNodeFields = {
  type: z.literal('part'),
  id: z.string().optional(),
  name: z.string().min(1),
  title: z.string().optional(),
  html: z.string().optional(),
  contents: z.boolean().default(true),
  opens: z.enum(['recto', 'verso', 'any']).optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  children: z.lazy(() => z.array(DocumentNode)),
}
const PartNodeSchema = closedObject(PartNodeFields)
export const PartNode = PartNodeSchema as z.ZodType<PartNode>

export const SectionNodeFields = {
  type: z.literal('section'),
  id: z.string().optional(),
  ...SectionFields,
  template: z.string().min(1).optional(),
  children: z.lazy(() => z.array(DocumentNode)),
}
export const SectionNodeSchema = closedObject(SectionNodeFields)
export const SectionNode = SectionNodeSchema as z.ZodType<SectionNode>

export const RecordNodeSchema = RecordNodeBase.extend({ children: z.lazy(() => z.array(DocumentNode)).optional() })
export const RecordNode = RecordNodeSchema as z.ZodType<RecordNode>

export const DocumentNodeMembers = [
  DivisionNodeSchema,
  PartNodeSchema,
  SectionNodeSchema,
  FlowNode,
  PageNodeSchema,
  SlideNode,
  PlacedNode,
  ContentsNode,
  RecordNodeSchema,
  BoardItemNode,
  LabelNode,
  BoardSectionNode,
] as const

export { PageNodeSchema }

export const DocumentNode: z.ZodType<DocumentNode> = z.lazy(() => discriminatedNodeUnion(DocumentNodeMembers))
