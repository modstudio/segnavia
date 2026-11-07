import { type Document, type DocumentOp, fingerprintDocument } from '@segnavia/format'

export interface ContentAddress {
  node: string
  field: string
  key?: string
}

export const CONTENT_FRAGMENT_SHAPES = {
  string: 'string',
  pageBody: '{ html }',
  slideContent: "{ kind: 'html', html }",
  record: 'record of strings',
} as const

type FragmentShape = keyof typeof CONTENT_FRAGMENT_SHAPES
type HeldNode = Record<string, unknown> & { id: string; type: string; children?: HeldNode[] }

const CONTENT_FIELDS: Readonly<Record<string, Readonly<Record<string, FragmentShape>>>> = {
  part: { html: 'string' },
  flow: { html: 'string' },
  page: { body: 'pageBody', regions: 'record' },
  slide: { content: 'slideContent', notes: 'string' },
  parentPage: { head: 'string', foot: 'string', regions: 'record' },
  template: { html: 'string' },
}

export interface ContentFragment {
  address: ContentAddress
  html: string
  node: HeldNode
  content: unknown
}

function nodes(document: Document): HeldNode[] {
  const result: HeldNode[] = []
  const visit = (values: readonly HeldNode[]): void => {
    for (const node of values) {
      result.push(node)
      if (Array.isArray(node.children)) visit(node.children)
    }
  }
  visit(document.children as HeldNode[])
  for (const collection of ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'] as const) {
    visit(document[collection] as HeldNode[])
  }
  return result
}

function addressLabel(address: ContentAddress): string {
  const suffix = address.key === undefined ? '' : ` key "${address.key}"`
  return `content address node "${address.node}" field "${address.field}"${suffix}`
}

function refuseAddress(address: ContentAddress): never {
  throw new Error(`${addressLabel(address)} is unknown; use a present HTML content field and, for a record field, a present key to clear this refusal`)
}

function fragmentValue(shape: FragmentShape, value: unknown, address: ContentAddress): string | undefined {
  if (shape === 'string') return typeof value === 'string' && address.key === undefined ? value : undefined
  if (shape === 'pageBody') {
    if (address.key !== undefined || typeof value !== 'object' || value === null || !('html' in value)) return undefined
    const html = (value as { html?: unknown }).html
    return typeof html === 'string' ? html : undefined
  }
  if (shape === 'slideContent') {
    if (address.key !== undefined || typeof value !== 'object' || value === null) return undefined
    const content = value as { kind?: unknown; html?: unknown }
    return content.kind === 'html' && typeof content.html === 'string' ? content.html : undefined
  }
  if (address.key === undefined || typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const html = (value as Record<string, unknown>)[address.key]
  return typeof html === 'string' ? html : undefined
}

export function contentFragments(document: Document): ContentFragment[] {
  fingerprintDocument(document)
  const result: ContentFragment[] = []
  for (const node of nodes(document)) {
    for (const [field, shape] of Object.entries(CONTENT_FIELDS[node.type] ?? {})) {
      const content = node[field]
      if (shape === 'record' && typeof content === 'object' && content !== null && !Array.isArray(content)) {
        for (const key of Object.keys(content)) {
          const address = { node: node.id, field, key }
          const html = fragmentValue(shape, content, address)
          if (html !== undefined) result.push({ address, html, node, content })
        }
        continue
      }
      const address = { node: node.id, field }
      const html = fragmentValue(shape, content, address)
      if (html !== undefined) result.push({ address, html, node, content })
    }
  }
  return result
}

export function contentFragment(document: Document, address: ContentAddress): ContentFragment {
  const found = contentFragments(document).find(
    (fragment) => fragment.address.node === address.node && fragment.address.field === address.field && fragment.address.key === address.key,
  )
  return found ?? refuseAddress(address)
}

export function fragmentContent(fragment: ContentFragment, html: string): unknown {
  const shape = CONTENT_FIELDS[fragment.node.type]?.[fragment.address.field]
  if (shape === 'string') return html
  if (shape === 'pageBody' || shape === 'slideContent') return { ...(fragment.content as Record<string, unknown>), html }
  return { ...(fragment.content as Record<string, unknown>), [fragment.address.key as string]: html }
}

export function fragmentOp(fragment: ContentFragment, html: string): DocumentOp {
  return {
    type: 'setContent',
    id: fragment.address.node,
    field: fragment.address.field,
    content: fragmentContent(fragment, html),
    prior: fragment.content,
  }
}
