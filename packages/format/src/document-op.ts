import { z } from 'zod'
import { definitionCollections } from './document.ts'
import { DocumentNode } from './document-nodes.ts'
import { ConditionNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'

export const DocumentCollection = z.enum(definitionCollections)
export type DocumentCollection = z.infer<typeof DocumentCollection>

export const DocumentLocation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('node'), id: z.string().min(1) }),
  z.object({ kind: z.literal('collection'), name: DocumentCollection }),
])
export type DocumentLocation = z.infer<typeof DocumentLocation>

const JsonMap = z.record(z.string(), z.unknown())
const SetChange = {
  fields: JsonMap,
  unset: z.array(z.string()),
  prior: JsonMap,
  priorAbsent: z.array(z.string()),
}
const ContentTarget = { type: z.literal('setContent'), id: z.string().min(1), field: z.string().min(1) }
const OperableNode = z.union([DocumentNode, ParentPageNode, TemplateNode, NoteSeriesNode, VariableNode, ConditionNode])

export const DocumentOp = z.union([
  z.object({ type: z.literal('insert'), parent: DocumentLocation, index: z.number().int().nonnegative(), node: OperableNode }),
  z.object({ type: z.literal('remove'), id: z.string().min(1), prior: OperableNode, parent: DocumentLocation, index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('move'),
    id: z.string().min(1),
    parent: DocumentLocation,
    index: z.number().int().nonnegative(),
    priorParent: DocumentLocation,
    priorIndex: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('setFields'), id: z.string().min(1), ...SetChange }),
  z.union([
    z.object({ ...ContentTarget, content: z.unknown().nonoptional(), prior: z.unknown().nonoptional() }),
    z.object({ ...ContentTarget, unset: z.literal(true), prior: z.unknown().nonoptional() }),
    z.object({ ...ContentTarget, content: z.unknown().nonoptional(), priorAbsent: z.literal(true) }),
    z.object({ ...ContentTarget, unset: z.literal(true), priorAbsent: z.literal(true) }),
  ]),
  z.object({ type: z.literal('setStyle'), ...SetChange }),
])
export type DocumentOp = z.infer<typeof DocumentOp>

export const DocumentBatch = z.object({ base: z.string(), ops: z.array(DocumentOp) })
export type DocumentBatch = z.infer<typeof DocumentBatch>
