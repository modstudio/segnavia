// Fills a page from data through attributes, with no script: one inert pass
// that a preview, a viewer and a printed copy all share. The attribute prefix
// is the host's (`data-<prefix>-value`), so a page written for one host reads
// as plain HTML anywhere else.
//
//   value    replaces the element's text with a string or finite number
//   href     sets href to an https link on an allowed origin
//   src      sets src to a data:image URL
//   each     repeats the element once per item of a list
//   when     keeps the element only where the item's `state` equals it
//   present  keeps the element only where the value is present
//   width    sets style width to a percentage, clamped to 0..100
//
// A path is dotted (`campaign.goal`). Inside a repeat it reads the item, and
// each leading `../` steps out one repeat.

import { type ChildNode, cloneNode, type Document, type Element, isTag, Text } from 'domhandler'
import { elements, parse, type SanitizeOptions, sanitize, serialize } from './sanitize.ts'

export const BINDINGS = ['value', 'href', 'src', 'each', 'when', 'present', 'width'] as const

export function bindingNames(prefix: string) {
  return Object.fromEntries(BINDINGS.map((binding) => [binding, `data-${prefix}-${binding}`])) as Record<(typeof BINDINGS)[number], string>
}

export interface FillOptions extends Pick<SanitizeOptions, 'linkOrigins'> {
  prefix: string
  data: Record<string, unknown>
  // Paths the host knows it cannot supply, reported with those that resolved to nothing.
  unavailable?: Iterable<string>
}

export interface Filled {
  html: string
  // Every path that resolved to nothing, so a host can say which data is missing.
  unavailable: string[]
  // The text every value binding wrote, for search and for checking a render.
  values: string[]
}

// The longest dotted prefix that is itself a key wins, so data keyed
// `"campaign.goal"` and data nested as `campaign: { goal }` both resolve.
function atPath(value: unknown, path: string): unknown {
  if (!path) return value
  const parts = path.split('.')
  let held = value
  let start = 0
  if (held && typeof held === 'object' && !Array.isArray(held)) {
    for (let length = parts.length; length > 0; length -= 1) {
      const prefix = parts.slice(0, length).join('.')
      if (Object.hasOwn(held, prefix)) {
        held = Reflect.get(held, prefix)
        start = length
        break
      }
    }
  }
  return parts.slice(start).reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return Object.hasOwn(current, part) ? Reflect.get(current, part) : undefined
  }, held)
}

function contextAt(stack: unknown[], path: string): { context: unknown; rest: string } {
  let depth = 0
  let rest = path
  while (rest.startsWith('../')) {
    depth += 1
    rest = rest.slice(3)
  }
  return { context: stack[Math.max(0, stack.length - 1 - depth)], rest }
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false
  if (typeof value === 'number') return value !== 0 && Number.isFinite(value)
  if (typeof value === 'string' || Array.isArray(value)) return value.length > 0
  return true
}

function safeHref(value: string, origins: ReadonlySet<string>): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && origins.has(url.origin)
  } catch {
    return false
  }
}

// Bindings name data, so a page using them runs no script of its own: a
// scripted page with bindings is refused rather than half-filled.
export function hasBindings(html: string, prefix: string): boolean {
  const names = new Set(Object.values(bindingNames(prefix)))
  return elements(parse(html).children).some((element) => Object.keys(element.attribs).some((name) => names.has(name)))
}

export function fill(html: string, options: FillOptions): Filled {
  const names = bindingNames(options.prefix)
  const origins = new Set([...(options.linkOrigins ?? [])].map((origin) => new URL(origin).origin))
  const unavailable = new Set(options.unavailable ?? [])
  const values: string[] = []
  const document: Document = parse(sanitize(html, { linkOrigins: options.linkOrigins }))

  const resolve = (path: string, stack: unknown[]) => {
    const { context, rest } = contextAt(stack, path)
    const value = atPath(context, rest)
    if (value === undefined) unavailable.add(path)
    return value
  }

  const take = (element: Element, name: string): string | undefined => {
    const value = element.attribs[name]
    delete element.attribs[name]
    return value
  }

  const applies = (element: Element, stack: unknown[]): boolean => {
    const context = stack[stack.length - 1]
    const when = take(element, names.when)
    if (when !== undefined && (!context || typeof context !== 'object' || Reflect.get(context, 'state') !== when)) return false
    const present = take(element, names.present)
    return present === undefined || isPresent(resolve(present, stack))
  }

  const applyWidth = (element: Element, stack: unknown[]) => {
    const width = take(element, names.width)
    if (width === undefined) return
    const value = resolve(width, stack)
    if (typeof value === 'number' && Number.isFinite(value)) element.attribs.style = `width: ${Math.min(100, Math.max(0, value))}%`
    else unavailable.add(width)
  }

  const applyValue = (element: Element, stack: unknown[]) => {
    const path = take(element, names.value)
    if (path === undefined) return
    const value = resolve(path, stack)
    element.children = []
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      const text = new Text(String(value))
      text.parent = element
      element.children = [text]
      // A filled-in value is isolated and reads in its own direction, so a
      // Hebrew name inside an English sentence cannot reorder the words around it.
      if (element.attribs.dir === undefined) element.attribs.dir = 'auto'
      values.push(String(value))
    } else if (value !== undefined) unavailable.add(path)
  }

  const applyUrls = (element: Element, stack: unknown[]) => {
    for (const attribute of ['href', 'src'] as const) {
      const path = take(element, names[attribute])
      if (path === undefined) continue
      const value = resolve(path, stack)
      const allowed = typeof value === 'string' && (attribute === 'href' ? safeHref(value, origins) : /^data:image\//i.test(value))
      if (allowed) element.attribs[attribute] = value
      else {
        delete element.attribs[attribute]
        if (value !== undefined) unavailable.add(path)
      }
    }
  }

  const fillElement = (element: Element, stack: unknown[]): Element[] => {
    const each = take(element, names.each)
    if (each !== undefined) {
      const list = resolve(each, stack)
      if (Array.isArray(list)) return list.flatMap((item) => fillElement(cloneNode(element, true), [...stack, item]))
      unavailable.add(each)
      return []
    }
    if (!applies(element, stack)) return []
    applyWidth(element, stack)
    applyValue(element, stack)
    applyUrls(element, stack)
    element.children = element.children.flatMap((child): ChildNode[] => {
      if (!isTag(child)) return [child]
      return fillElement(child, stack).map((filled) => {
        filled.parent = element
        return filled
      })
    })
    return [element]
  }

  document.children = document.children.flatMap((node): ChildNode[] => {
    if (!isTag(node)) return [node]
    return fillElement(node, [options.data]).map((filled) => {
      filled.parent = document
      return filled
    })
  })
  return { html: serialize(document), unavailable: [...unavailable], values }
}
