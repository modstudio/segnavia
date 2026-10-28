import { type AnyNode, type Document, type Element, isTag } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import { IDML_LIMITS, type IdmlLimits } from './limits.ts'
import type { ZipEntry } from './zip.ts'

export interface IdmlMargin {
  top: number
  bottom: number
  left: number
  right: number
}

export interface IdmlDocumentPreferences {
  pageWidth: number
  pageHeight: number
  facingPages: boolean
  binding: 'left-to-right' | 'right-to-left'
  margin: IdmlMargin
}

export interface IdmlPage {
  id: string
  appliedMaster?: string
  stories: string[]
}

export interface IdmlSpread {
  id: string
  pages: IdmlPage[]
}

export interface IdmlMasterSpread {
  id: string
  pages: IdmlPage[]
}

export interface IdmlStory {
  id: string
  part: string
}

export interface IdmlModel {
  id: string
  preferences: IdmlDocumentPreferences
  spreads: IdmlSpread[]
  masterSpreads: IdmlMasterSpread[]
  stories: IdmlStory[]
  partsRead: string[]
  unsupportedElements: Record<string, number>
}

const MAPPED_ELEMENTS = new Set(['Document', 'DocumentPreference', 'MarginPreference', 'Spread', 'Page', 'TextFrame'])

function refusal(subject: string, clear: string): Error {
  return new Error(`${subject}; ${clear} to clear this refusal`)
}

function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

function elements(root: AnyNode | Document, name?: string): Element[] {
  const found: Element[] = []
  const visit = (node: AnyNode | Document): void => {
    if (isTag(node)) {
      if (!name || localName(node.name) === name) found.push(node)
    }
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(root)
  return found
}

function attribute(element: Element, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = element.attribs[name]
    if (value !== undefined) return value
  }
  return undefined
}

function numberAttribute(element: Element | undefined, name: string, fallback?: number): number {
  const raw = element && attribute(element, name)
  const value = raw === undefined ? fallback : Number(raw)
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw refusal(`IDML ${name} must be a non-negative number`, `set ${name} to a non-negative numeric value`)
  }
  return value
}

function boolAttribute(element: Element, name: string, fallback: boolean): boolean {
  const raw = attribute(element, name)
  if (raw === undefined) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw refusal(`IDML ${name} must be true or false`, `set ${name} to true or false`)
}

function documentDepth(document: Document): number {
  let deepest = 0
  const visit = (node: AnyNode, depth: number): void => {
    if (isTag(node)) {
      deepest = Math.max(deepest, depth)
      for (const child of node.children) visit(child, depth + 1)
    }
  }
  for (const child of document.children) visit(child, 1)
  return deepest
}

interface ParsedPart {
  name: string
  document: Document
  all: Element[]
}

function parseParts(entries: ZipEntry[], limits: IdmlLimits): ParsedPart[] {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return entries
    .filter((entry) => entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => {
      let source: string
      try {
        source = decoder.decode(entry.bytes)
      } catch {
        throw refusal(`IDML XML part ${entry.name} is not valid UTF-8`, 'export that XML part as UTF-8')
      }
      let document: Document
      try {
        document = parseDocument(source, { xmlMode: true, recognizeSelfClosing: true })
      } catch (error) {
        throw refusal(`IDML XML part ${entry.name} could not be parsed: ${String(error)}`, 'export well-formed XML')
      }
      if (elements(document).length === 0) throw refusal(`IDML XML part ${entry.name} has no root element`, 'export a non-empty well-formed XML part')
      const depth = documentDepth(document)
      if (depth > limits.xmlDepth) {
        throw refusal(
          `IDML XML part ${entry.name} has depth ${depth}, exceeding the ${limits.xmlDepth} level XML depth limit`,
          `reduce its nesting to ${limits.xmlDepth} levels or fewer`,
        )
      }
      return { name: entry.name, document, all: elements(document) }
    })
}

function page(element: Element): IdmlPage {
  const id = attribute(element, 'Self')
  if (!id) throw refusal('an IDML Page has no Self identifier', 'give every Page a Self identifier')
  const stories = new Set<string>()
  for (const frame of elements(element, 'TextFrame')) {
    const story = attribute(frame, 'ParentStory')
    if (story) stories.add(story)
  }
  return { id, appliedMaster: attribute(element, 'AppliedMaster'), stories: [...stories] }
}

function pageStoriesFromPart(part: ParsedPart, pages: IdmlPage[]): void {
  const byId = new Map(pages.map((value) => [value.id, value]))
  for (const frame of part.all.filter((element) => localName(element.name) === 'TextFrame')) {
    const parentPage = attribute(frame, 'ParentPage')
    const story = attribute(frame, 'ParentStory')
    const target = parentPage && byId.get(parentPage)
    if (target && story && !target.stories.includes(story)) target.stories.push(story)
  }
}

function spreads(parts: ParsedPart[], kind: 'Spread' | 'MasterSpread'): (IdmlSpread | IdmlMasterSpread)[] {
  const result: (IdmlSpread | IdmlMasterSpread)[] = []
  for (const part of parts) {
    for (const element of part.all.filter((candidate) => localName(candidate.name) === kind)) {
      const id = attribute(element, 'Self')
      if (!id) continue
      const pages = elements(element, 'Page').map(page)
      pageStoriesFromPart(part, pages)
      result.push({ id, pages })
    }
  }
  return result
}

function stories(parts: ParsedPart[]): IdmlStory[] {
  const result: IdmlStory[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    for (const element of part.all.filter((candidate) => localName(candidate.name) === 'Story')) {
      const id = attribute(element, 'Self')
      if (!id || seen.has(id)) continue
      seen.add(id)
      result.push({ id, part: part.name })
    }
  }
  return result
}

function unsupported(parts: ParsedPart[]): Record<string, number> {
  const counts = new Map<string, number>()
  for (const part of parts) {
    for (const element of part.all) {
      const name = localName(element.name)
      if (MAPPED_ELEMENTS.has(name)) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)))
}

export function idmlModel(entries: ZipEntry[], limits: IdmlLimits = IDML_LIMITS): IdmlModel {
  const parts = parseParts(entries, limits)
  const document = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'Document')
  const preference = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'DocumentPreference')
  if (!document) throw refusal('designmap.xml has no IDML Document element', 'export a valid IDML design map')
  if (!preference) throw refusal('IDML DocumentPreference is missing', 'export document preferences with the package')
  const margin = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'MarginPreference')
  const binding = attribute(preference, 'PageBinding') ?? attribute(document, 'PageBinding') ?? 'LeftToRight'
  if (binding !== 'LeftToRight' && binding !== 'RightToLeft') {
    throw refusal(`IDML PageBinding ${binding} is not supported`, 'use LeftToRight or RightToLeft page binding')
  }
  const spreadList = spreads(parts, 'Spread') as IdmlSpread[]
  return {
    id: attribute(document, 'Self') ?? 'IDML document',
    preferences: {
      pageWidth: numberAttribute(preference, 'PageWidth'),
      pageHeight: numberAttribute(preference, 'PageHeight'),
      facingPages: boolAttribute(preference, 'FacingPages', true),
      binding: binding === 'RightToLeft' ? 'right-to-left' : 'left-to-right',
      margin: {
        top: numberAttribute(margin, 'Top', 0),
        bottom: numberAttribute(margin, 'Bottom', 0),
        left: numberAttribute(margin, 'Left', 0),
        right: numberAttribute(margin, 'Right', 0),
      },
    },
    spreads: spreadList,
    masterSpreads: spreads(parts, 'MasterSpread') as IdmlMasterSpread[],
    stories: stories(parts),
    partsRead: entries.map((entry) => entry.name),
    unsupportedElements: unsupported(parts),
  }
}
