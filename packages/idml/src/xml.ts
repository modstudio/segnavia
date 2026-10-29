import { type AnyNode, type Document, type Element, isTag } from 'domhandler'
import { refusal } from './refusal.ts'

export function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

export function elements(root: AnyNode | Document, name?: string): Element[] {
  const found: Element[] = []
  const pending: (AnyNode | Document)[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue
    if (isTag(node) && (!name || localName(node.name) === name)) found.push(node)
    if ('children' in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) pending.push(node.children[index] as AnyNode)
    }
  }
  return found
}

export function attribute(element: Element, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = element.attribs[name]
    if (value !== undefined) return value
  }
  return undefined
}

export function numberAttribute(element: Element | undefined, name: string, fallback?: number): number {
  const raw = element?.attribs[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw refusal(`IDML ${name} must be a non-negative number`, `set ${name} to a non-negative numeric value`)
  }
  return value
}

export function idmlDirection(value: string | undefined): 'ltr' | 'rtl' | undefined {
  const normalized = value?.toLowerCase()
  if (normalized?.includes('righttoleft')) return 'rtl'
  if (normalized?.includes('lefttoright')) return 'ltr'
  return undefined
}
