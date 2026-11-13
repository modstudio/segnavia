import { DOCUMENT_NODE_MODEL, type DocumentNodeType } from './document-node-model.ts'
import { walkDocumentNodes } from './document-node-refinement.ts'
import type { DocumentNode } from './document-nodes.ts'

export interface HtmlLocation {
  html: string
  path: PropertyKey[]
}

export function htmlValues(node: { type: DocumentNodeType } & Record<string, unknown>): string[] {
  return [...DOCUMENT_NODE_MODEL[node.type].content].flatMap((field) => {
    const value = node[field]
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    if ('html' in value && typeof value.html === 'string') return [value.html]
    const values = Object.values(value)
    return values.every((entry) => typeof entry === 'string') ? values : []
  })
}

export function contentHtml(nodes: DocumentNode[]): HtmlLocation[] {
  const result: HtmlLocation[] = []
  walkDocumentNodes(nodes, (node, path) => result.push(...htmlValues(node as typeof node & Record<string, unknown>).map((html) => ({ html, path }))))
  return result
}

export function dataAttributeValues(html: string, attributeName: string): string[] {
  const values: string[] = []
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const attribute = new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi')
  for (const match of html.matchAll(attribute)) values.push(match[1] ?? match[2] ?? match[3] ?? '')
  return values
}
