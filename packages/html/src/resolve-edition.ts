import type { Document } from '@segnavia/format'
import { isTag } from 'domhandler'
import { CONDITION_ATTRIBUTE, conditionNames } from './condition-attributes.ts'
import { parse, serialize } from './sanitize.ts'

function resolveHtml(html: string, enabled: ReadonlySet<string>): string {
  const tree = parse(html)
  const resolve = (nodes: typeof tree.children): typeof tree.children =>
    nodes.flatMap((node) => {
      if (!isTag(node)) return [node]
      const marker = node.attribs[CONDITION_ATTRIBUTE]
      if (marker !== undefined && !conditionNames(marker).some((name) => enabled.has(name))) return []
      delete node.attribs[CONDITION_ATTRIBUTE]
      node.children = resolve(node.children)
      return [node]
    })
  tree.children = resolve(tree.children)
  return serialize(tree)
}

function resolveNode(node: Document['children'][number], enabled: ReadonlySet<string>): Document['children'][number] | undefined {
  if ('conditions' in node && node.conditions !== undefined && !node.conditions.some((name) => enabled.has(name))) return undefined
  const { conditions: _conditions, ...unmarked } = node as typeof node & { conditions?: string[] }
  let next: Document['children'][number] = unmarked as Document['children'][number]
  if (next.type === 'flow') next = { ...next, html: resolveHtml(next.html, enabled) }
  if (next.type === 'part' && next.html !== undefined) next = { ...next, html: resolveHtml(next.html, enabled) }
  if (next.type === 'page') {
    const body = next.body && 'html' in next.body ? { ...next.body, html: resolveHtml(next.body.html, enabled) } : next.body
    const regions = next.regions && Object.fromEntries(Object.entries(next.regions).map(([name, html]) => [name, resolveHtml(html, enabled)]))
    next = { ...next, body, regions }
  }
  if (next.type === 'slide' && 'kind' in next.content && next.content.kind === 'html') {
    next = { ...next, content: { ...next.content, html: resolveHtml(next.content.html, enabled) } }
  }
  if ('children' in next && next.children !== undefined) {
    next = { ...next, children: next.children.flatMap((child) => resolveNode(child, enabled) ?? []) } as typeof next
  }
  return next
}

export function resolveEdition(document: Document, edition?: string): Document {
  if (document.conditions.length === 0) return document
  const selected = edition ?? document.defaultEdition
  const declared = document.editions.map((entry) => entry.name)
  const entry = document.editions.find((candidate) => candidate.name === selected)
  if (!entry) {
    const names = declared.map((name) => JSON.stringify(name)).join(', ')
    throw new RangeError(`requested edition ${JSON.stringify(selected)} is unknown; use one of ${names} to clear this refusal`)
  }
  const enabled = new Set(entry.conditions)
  return {
    ...document,
    children: document.children.flatMap((node) => resolveNode(node, enabled) ?? []),
    templates: document.templates.map((template) => ({ ...template, html: resolveHtml(template.html, enabled) })),
    parentPages: document.parentPages.map((parent) => ({
      ...parent,
      regions: Object.fromEntries(
        Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: resolveHtml(region.html, enabled) }]),
      ),
    })),
  }
}
