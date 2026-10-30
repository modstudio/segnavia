import type { Element } from 'domhandler'
import { elements } from '../sanitize.ts'

export const PAGE_REFERENCE_ATTRIBUTE = 'data-ref'
export const PAGE_REFERENCE_VALUE = 'page'
export const PAGE_REFERENCE_SELECTOR = 'a[data-ref="page"]'

export function pageReferenceTarget(attribs: Record<string, string>): string | undefined {
  if (attribs[PAGE_REFERENCE_ATTRIBUTE] !== PAGE_REFERENCE_VALUE) return undefined
  const href = attribs.href
  if (href?.startsWith('#') && href.length > 1) return href.slice(1)
  const prefix = 'segnavia:target/'
  return href?.startsWith(prefix) && href.length > prefix.length ? href.slice(prefix.length) : undefined
}

export function pageReferenceNodes(roots: Element[]): Element[] {
  return roots.flatMap((root) => [root, ...elements(root.children)]).filter((node) => node.name === 'a' && pageReferenceTarget(node.attribs) !== undefined)
}

export function pageReferenceTargets(roots: Element[]): string[] {
  return [...new Set(pageReferenceNodes(roots).flatMap((node) => pageReferenceTarget(node.attribs) ?? []))]
}
