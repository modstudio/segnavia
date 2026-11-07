import { z } from 'zod'
import { DivisionNodeFields, PartNodeFields, SectionNodeFields } from './document-nodes.ts'
import { ConditionNode, ContentsNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { BoardItemNode, BoardSectionNode, FlowNode, LabelNode, PageNode, PlacedNode, RecordNode, SlideNode } from './document-nodes-common.ts'

/** Every node shape accepted at a document command input edge. */
export const DocumentNodeInput = z.discriminatedUnion('type', [
  z.object(DivisionNodeFields),
  z.object(PartNodeFields),
  z.object(SectionNodeFields),
  FlowNode,
  PageNode,
  SlideNode,
  PlacedNode,
  ContentsNode,
  RecordNode,
  BoardItemNode,
  LabelNode,
  BoardSectionNode,
  ParentPageNode,
  TemplateNode,
  NoteSeriesNode,
  VariableNode,
  ConditionNode,
])
export type DocumentNodeInput = z.input<typeof DocumentNodeInput>
