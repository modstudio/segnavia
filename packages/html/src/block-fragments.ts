import {
  DOCUMENT_NODE_MODEL,
  type Document,
  type DocumentNodeType,
  type DocumentOp,
  documentEntries,
  type OperationDocument,
  requireParsedDocument,
} from '@segnavia/format'

export interface ContentAddress {
  node: string
  field: string
  key?: string
}

export type FragmentShape = 'htmlString' | 'pageBody' | 'slideContent' | 'record' | 'text'

type HeldNode = Record<string, unknown> & { id: string; type: string }
type FieldShapes = Readonly<Record<string, FragmentShape>>

export const CONTENT_FIELD_SHAPES: Readonly<Record<DocumentNodeType, FieldShapes>> = {
  division: {},
  part: { html: 'htmlString' },
  section: {},
  flow: { html: 'htmlString' },
  page: { body: 'pageBody', regions: 'record' },
  slide: { content: 'slideContent', notes: 'text' },
  placed: {},
  contents: {},
  record: {},
  item: {},
  label: {},
  boardSection: {},
  parentPage: { head: 'htmlString', foot: 'htmlString', regions: 'record' },
  template: { html: 'htmlString' },
  noteSeries: {},
  variable: {},
  headTemplate: {},
  condition: {},
}

interface FragmentAccessor {
  read: (value: unknown, key?: string) => string | undefined
  write: (value: unknown, html: string, key?: string) => unknown
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const FRAGMENT_ACCESSORS: Readonly<Record<FragmentShape, FragmentAccessor>> = {
  htmlString: {
    read: (value, key) => (key === undefined && typeof value === 'string' ? value : undefined),
    write: (_value, html) => html,
  },
  pageBody: {
    read: (value, key) => (key === undefined && typeof object(value)?.html === 'string' ? (object(value)?.html as string) : undefined),
    write: (value, html) => ({ ...object(value), html }),
  },
  slideContent: {
    read: (value, key) => {
      const held = object(value)
      return key === undefined && held?.kind === 'html' && typeof held.html === 'string' ? held.html : undefined
    },
    write: (value, html) => ({ ...object(value), html }),
  },
  record: {
    read: (value, key) => (key !== undefined && typeof object(value)?.[key] === 'string' ? (object(value)?.[key] as string) : undefined),
    write: (value, html, key) => ({ ...object(value), [key as string]: html }),
  },
  text: {
    read: () => undefined,
    write: (value) => value,
  },
}

export interface ContentFragment {
  address: ContentAddress
  html: string
  node: HeldNode
  content: unknown
  shape: Exclude<FragmentShape, 'text'>
}

function addressLabel(address: ContentAddress): string {
  const suffix = address.key === undefined ? '' : ` key "${address.key}"`
  return `content address node "${address.node}" field "${address.field}"${suffix}`
}

function refuseAddress(address: ContentAddress): never {
  throw new Error(`${addressLabel(address)} is unknown; use a present HTML content field and, for a record field, a present key to clear this refusal`)
}

export function sameAddress(left: ContentAddress, right: ContentAddress): boolean {
  return left.node === right.node && left.field === right.field && left.key === right.key
}

export function findFragment<T extends ContentFragment>(fragments: readonly T[], address: ContentAddress): T {
  return fragments.find((fragment) => sameAddress(fragment.address, address)) ?? refuseAddress(address)
}

export function contentFieldShape(type: DocumentNodeType, field: string): FragmentShape {
  const shape = CONTENT_FIELD_SHAPES[type][field]
  if (!shape) throw new Error(`content field ${type}.${field} has no fragment shape; classify it as HTML or text to clear this refusal`)
  return shape
}

function fieldFragments(node: HeldNode, field: string, shape: Exclude<FragmentShape, 'text'>): ContentFragment[] {
  const content = node[field]
  const keys = shape === 'record' ? Object.keys(object(content) ?? {}) : [undefined]
  return keys.flatMap((key) => {
    const html = FRAGMENT_ACCESSORS[shape].read(content, key)
    return html === undefined ? [] : [{ address: { node: node.id, field, ...(key === undefined ? {} : { key }) }, html, node, content, shape }]
  })
}

export function contentFragments(document: Document): ContentFragment[] {
  requireParsedDocument(document, 'blockView and block ops')
  const result: ContentFragment[] = []
  for (const { node } of documentEntries(document as unknown as OperationDocument)) {
    const type = node.type as DocumentNodeType
    for (const field of DOCUMENT_NODE_MODEL[type].content) {
      const shape = contentFieldShape(type, field)
      if (shape === 'text') continue
      result.push(...fieldFragments(node, field, shape))
    }
  }
  return result
}

export function contentFragment(document: Document, address: ContentAddress): ContentFragment {
  return findFragment(contentFragments(document), address)
}

export function fragmentContent(fragment: ContentFragment, html: string, held: unknown = fragment.content): unknown {
  return writeFragment(fragment.shape, held, html, fragment.address.key)
}

export function writeFragment(shape: Exclude<FragmentShape, 'text'>, held: unknown, html: string, key?: string): unknown {
  return FRAGMENT_ACCESSORS[shape].write(held, html, key)
}

export function fragmentOps(changes: readonly { fragment: ContentFragment; html: string }[]): DocumentOp[] {
  const groups = new Map<string, { fragment: ContentFragment; content: unknown }>()
  for (const { fragment, html } of changes) {
    const key = `${fragment.address.node}\u0000${fragment.address.field}`
    const group = groups.get(key) ?? { fragment, content: fragment.content }
    group.content = fragmentContent(fragment, html, group.content)
    groups.set(key, group)
  }
  return [...groups.values()].map(({ fragment, content }) => ({
    type: 'setContent',
    id: fragment.address.node,
    field: fragment.address.field,
    content,
    prior: fragment.content,
  }))
}

export function fragmentOp(fragment: ContentFragment, html: string): DocumentOp {
  return fragmentOps([{ fragment, html }])[0] as DocumentOp
}
