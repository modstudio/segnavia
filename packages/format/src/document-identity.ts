import { bytesToHex } from './bytes-to-hex.ts'
import type { DivisionNode, DocumentNode, PartNode, SectionNode } from './document-nodes.ts'
import { Refusal } from './refusal.ts'

export class DocumentIdRefusedError extends Refusal {
  override name = 'DocumentIdRefusedError'

  constructor(code: 'duplicate-id' | 'unminted-id', subject: string, message: string) {
    super(code, message, { subject })
  }
}

export interface DocumentParseOptions {
  newId?: () => string
}

export const defaultNewId = (): string => {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('crypto.randomUUID and crypto.getRandomValues are unavailable; pass newId to clear this refusal')
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = 0x40 | ((bytes[6] ?? 0) & 0x0f)
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type IdentifiedLeaf =
  Exclude<DocumentNode, DivisionNode | PartNode | SectionNode> extends infer N ? (N extends DocumentNode ? Omit<N, 'id'> & { id: string } : never) : never

interface IdentifiedDivisionNode extends Omit<DivisionNode, 'id' | 'children'> {
  id: string
  children: IdentifiedNode[]
}

interface IdentifiedPartNode extends Omit<PartNode, 'id' | 'children'> {
  id: string
  children: IdentifiedNode[]
}

interface IdentifiedSectionNode extends Omit<SectionNode, 'id' | 'children'> {
  id: string
  children: IdentifiedNode[]
}

export type IdentifiedNode = IdentifiedLeaf | IdentifiedDivisionNode | IdentifiedPartNode | IdentifiedSectionNode

type DefinitionNode = { type: string; id?: string; name?: string }

export type IdentifiedDocument<
  T extends {
    id?: string
    children: DocumentNode[]
    parentPages: DefinitionNode[]
    templates: DefinitionNode[]
    noteSeries: DefinitionNode[]
    variables: DefinitionNode[]
    headTemplates: DefinitionNode[]
    conditions: DefinitionNode[]
  },
> = Omit<T, 'id' | 'children' | 'parentPages' | 'templates' | 'noteSeries' | 'variables' | 'headTemplates' | 'conditions'> & {
  id: string
  children: IdentifiedNode[]
  parentPages: Array<T['parentPages'][number] & { id: string }>
  templates: Array<T['templates'][number] & { id: string }>
  noteSeries: Array<T['noteSeries'][number] & { id: string }>
  variables: Array<T['variables'][number] & { id: string }>
  headTemplates: Array<T['headTemplates'][number] & { id: string }>
  conditions: Array<T['conditions'][number] & { id: string }>
}

function describe(node: { type: string; name?: string }, path: string): string {
  return `${node.type}${node.name ? ` "${node.name}"` : ''} at ${path}`
}

export function identifyDocument<
  T extends {
    type: 'document'
    id?: string
    children: DocumentNode[]
    parentPages: DefinitionNode[]
    templates: DefinitionNode[]
    noteSeries: DefinitionNode[]
    variables: DefinitionNode[]
    headTemplates: DefinitionNode[]
    conditions: DefinitionNode[]
  },
>(document: T, options: DocumentParseOptions = {}): IdentifiedDocument<T> {
  const newId = options.newId ?? defaultNewId
  const seen = new Map<string, string>()
  const claim = <N extends { type: string; id?: string; name?: string }>(node: N, path: string): N & { id: string } => {
    const id = node.id ?? newId()
    if (!id) {
      const subject = describe(node, path)
      throw new DocumentIdRefusedError('unminted-id', subject, `${subject} could not mint an id; return a non-empty id from newId to clear this refusal`)
    }
    const first = seen.get(id)
    if (first) {
      throw new DocumentIdRefusedError(
        'duplicate-id',
        id,
        `id "${id}" is shared by ${first} and ${describe(node, path)}; change or remove one id to clear this refusal`,
      )
    }
    seen.set(id, describe(node, path))
    return { ...node, id }
  }
  const nodes = (values: DocumentNode[], path: string): IdentifiedNode[] =>
    values.map((value, index) => {
      const identified = claim(value, `${path}[${index}]`)
      return 'children' in identified
        ? ({ ...identified, children: nodes(identified.children, `${path}[${index}].children`) } as IdentifiedNode)
        : (identified as IdentifiedNode)
    })
  const definitions = <N extends DefinitionNode>(values: N[], path: string): Array<N & { id: string }> =>
    values.map((value, index) => claim(value, `${path}[${index}]`))
  const root = claim(document, 'document')
  return {
    ...root,
    children: nodes(document.children, 'children'),
    parentPages: definitions(document.parentPages, 'parentPages'),
    templates: definitions(document.templates, 'templates'),
    noteSeries: definitions(document.noteSeries, 'noteSeries'),
    variables: definitions(document.variables, 'variables'),
    headTemplates: definitions(document.headTemplates, 'headTemplates'),
    conditions: definitions(document.conditions, 'conditions'),
  } as IdentifiedDocument<T>
}
