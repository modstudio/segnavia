import { z } from 'zod'
import { ContentsNode, SectionFields } from './document-nodes-book.ts'
import {
  BoardItemNode,
  BoardSectionNode,
  DivisionName,
  DivisionSettings,
  FlowNode,
  LabelNode,
  PageNode,
  PlacedNode,
  RecordNode,
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

export type DocumentNode =
  | DivisionNode
  | PartNode
  | SectionNode
  | z.infer<typeof FlowNode>
  | z.infer<typeof PageNode>
  | z.infer<typeof SlideNode>
  | z.infer<typeof PlacedNode>
  | z.infer<typeof ContentsNode>
  | z.infer<typeof RecordNode>
  | z.infer<typeof BoardItemNode>
  | z.infer<typeof LabelNode>
  | z.infer<typeof BoardSectionNode>

export type DocumentNodePath = Array<string | number>

export function collectRecords(
  nodes: DocumentNode[],
  path: DocumentNodePath = ['children'],
): Array<{ node: z.infer<typeof RecordNode>; path: DocumentNodePath }> {
  return nodes.flatMap((node, index) => {
    const nodePath = [...path, index]
    const own = node.type === 'record' ? [{ node, path: nodePath }] : []
    return 'children' in node ? [...own, ...collectRecords(node.children, [...nodePath, 'children'])] : own
  })
}

export const DivisionNodeFields = {
  type: z.literal('division'),
  id: z.string().optional(),
  name: DivisionName,
  settings: DivisionSettings.optional(),
  children: z.lazy(() => z.array(DocumentNode)),
}
export const DivisionNode = z.object(DivisionNodeFields) as z.ZodType<DivisionNode>

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
export const PartNode = z.object(PartNodeFields) as z.ZodType<PartNode>

export const SectionNodeFields = {
  type: z.literal('section'),
  id: z.string().optional(),
  ...SectionFields,
  template: z.string().min(1).optional(),
  children: z.lazy(() => z.array(DocumentNode)),
}
export const SectionNode = z.object(SectionNodeFields) as z.ZodType<SectionNode>

export const DocumentNode: z.ZodType<DocumentNode> = z.lazy(() =>
  z.union([
    DivisionNode,
    PartNode,
    SectionNode,
    FlowNode,
    PageNode,
    SlideNode,
    PlacedNode,
    ContentsNode,
    RecordNode,
    BoardItemNode,
    LabelNode,
    BoardSectionNode,
  ]),
)
