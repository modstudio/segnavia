import {
  DOCUMENT_NODE_MODEL,
  type Document,
  DocumentCollection,
  type DocumentLocation,
  type Limits,
  Measurements,
  type OperationDocument,
  type OperationNode,
  Plan,
  type PlanPage,
  type PreflightReport,
  resolveLimits,
} from '@segnavia/format'
import { type BlockViewEntry, blockView } from './block-view.ts'

export interface DescribeDocumentOptions {
  detail?: 'concise' | 'full'
  limits?: Limits
  measurements?: Measurements
  plan?: Plan
  preflight?: PreflightReport
}

interface DocumentDescriptionPlanPage {
  number: number
  folio: string | null | undefined
  start?: PlanPage['start']
  role: PlanPage['role']
  face: PlanPage['face']
}

interface DocumentDescriptionPlan {
  fingerprint: string
  breaks: string[]
  pages: DocumentDescriptionPlanPage[]
}

type DocumentDescriptionMeasured = Pick<Measurements, 'fits' | 'properties'>

export interface DocumentDescriptionNode {
  id: string
  type: string
  name?: string
  fields: Record<string, unknown>
  location: { parent?: string; collection?: string; index: number }
  children: DocumentDescriptionNode[]
}

export interface DocumentDescription {
  structure: DocumentDescriptionNode[]
  definitions: Record<string, DocumentDescriptionNode[]>
  blocks: BlockViewEntry[]
  styles: {
    document: Record<string, unknown>
    nodes: []
    inheritance: 'none'
  }
  plan?: DocumentDescriptionPlan
  measured?: DocumentDescriptionMeasured
  preflight?: PreflightReport
}

function locationValue(parent: DocumentLocation, index: number): DocumentDescriptionNode['location'] {
  return parent.kind === 'collection' ? { collection: parent.name, index } : { parent: parent.id, index }
}

function describeNode(node: OperationNode, parent: DocumentLocation, index: number): DocumentDescriptionNode {
  const model = DOCUMENT_NODE_MODEL[node.type as keyof typeof DOCUMENT_NODE_MODEL]
  const fields = Object.fromEntries(
    Object.entries(node).filter(
      ([field, value]) => value !== undefined && !['id', 'type', 'name', 'children', 'style'].includes(field) && !model?.content.has(field),
    ),
  )
  return {
    id: node.id,
    type: node.type,
    ...(model?.fields.has('name') && typeof node.name === 'string' ? { name: node.name } : {}),
    fields,
    location: locationValue(parent, index),
    children: Array.isArray(node.children) ? node.children.map((child, childIndex) => describeNode(child, { kind: 'node', id: node.id }, childIndex)) : [],
  }
}

function conciseBlock(block: BlockViewEntry, limit: number): BlockViewEntry {
  const points = [...block.text]
  if (points.length <= limit) return block
  if (limit === 0) return { ...block, text: '' }
  const available = limit - 1
  let text = ''
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(block.text)) {
    if ([...text, ...segment].length > available) break
    text += segment
  }
  return { ...block, text: `${text}…` }
}

/**
 * Describes only style state held by the current model: document style keys.
 * Nodes have no style state or inheritance; per-node styles arrive with the StyleSheet.
 * Concise detail bounds each block's text to descriptionTextChars code points,
 * preserving graphemes and replacing the elided tail with an ellipsis; full detail leaves text intact.
 */
export function describeDocument(document: Document, options: DescribeDocumentOptions = {}): DocumentDescription {
  const held = document as unknown as OperationDocument
  const structure = held.children.map((node, index) => describeNode(node, { kind: 'node', id: held.id }, index))
  const definitions: Record<string, DocumentDescriptionNode[]> = {}
  for (const name of DocumentCollection.options) {
    const nodes = held[name] as OperationNode[]
    definitions[name] = nodes.map((node, index) => describeNode(node, { kind: 'collection', name }, index))
  }
  const limit = resolveLimits(document.limits, options.limits).descriptionTextChars
  const blocks = blockView(document).map((block) => (options.detail === 'full' ? block : conciseBlock(block, limit)))
  const plan = options.plan === undefined ? undefined : Plan.parse(options.plan, { limits: resolveLimits(document.limits, options.limits) })
  const measurements = options.measurements === undefined ? undefined : Measurements.parse(options.measurements)
  return {
    structure,
    definitions,
    blocks,
    styles: { document: { ...(document.style ?? {}) }, nodes: [], inheritance: 'none' },
    ...(plan === undefined
      ? {}
      : {
          plan: {
            fingerprint: plan.fingerprint,
            breaks: plan.breaks,
            pages: plan.pages.map((page, index) => ({
              number: index + 1,
              folio: plan.folios[index],
              ...(page.start === undefined ? {} : { start: page.start }),
              role: page.role,
              face: page.face,
            })),
          },
        }),
    ...(options.preflight === undefined ? {} : { preflight: options.preflight }),
    ...(measurements === undefined ? {} : { measured: { fits: measurements.fits, properties: measurements.properties } }),
  }
}
