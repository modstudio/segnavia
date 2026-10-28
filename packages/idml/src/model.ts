import { type AnyNode, type Document, type Element, isTag } from 'domhandler'
import { Parser, parseDocument } from 'htmlparser2'
import { IDML_LIMITS, type IdmlLimits } from './limits.ts'
import { refusal } from './refusal.ts'
import { type IdmlReportData, ReportCollector } from './report.ts'
import { parseStories } from './story-model.ts'
import { parseStyles, parseSwatches } from './styles.ts'
import type { IdmlFramePreference, IdmlStory, IdmlStyle, IdmlSwatch } from './types.ts'
import type { ZipEntry } from './zip.ts'

export type { IdmlStory } from './types.ts'

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

export interface IdmlModel {
  id: string
  preferences: IdmlDocumentPreferences
  spreads: IdmlSpread[]
  masterSpreads: IdmlMasterSpread[]
  stories: IdmlStory[]
  masterStoryIds: string[]
  partsRead: string[]
  unsupportedElements: Record<string, number>
  styles?: IdmlStyle[]
  swatches?: IdmlSwatch[]
  report?: IdmlReportData
}

const MAPPED_ELEMENTS = new Set([
  'Document',
  'DocumentPreference',
  'MarginPreference',
  'MasterSpread',
  'Spread',
  'Page',
  'Story',
  'TextFrame',
  'TextFramePreference',
  'PathGeometry',
  'GeometryPathType',
  'PathPointArray',
  'PathPointType',
  'Styles',
  'Graphic',
])

function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

function elements(root: AnyNode | Document, name?: string): Element[] {
  const found: Element[] = []
  const pending: (AnyNode | Document)[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue
    if (isTag(node)) {
      if (!name || localName(node.name) === name) found.push(node)
    }
    if ('children' in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) pending.push(node.children[index] as AnyNode)
    }
  }
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

function checkXmlDepth(source: string, part: string, limit: number): void {
  let depth = 0
  const parser = new Parser(
    {
      onopentag() {
        depth += 1
        if (depth > limit) {
          throw refusal(`IDML XML part ${part} exceeds the ${limit} level XML depth limit`, `reduce its nesting to ${limit} levels or fewer`)
        }
      },
      onclosetag() {
        depth -= 1
      },
    },
    { xmlMode: true, recognizeSelfClosing: true },
  )
  parser.end(source)
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
        checkXmlDepth(source, entry.name, limits.xmlDepth)
        document = parseDocument(source, { xmlMode: true, recognizeSelfClosing: true })
      } catch (error) {
        if (error instanceof Error && error.message.includes('XML depth limit')) throw error
        throw refusal(`IDML XML part ${entry.name} could not be parsed: ${String(error)}`, 'export well-formed XML')
      }
      const all = elements(document)
      if (all.length === 0) throw refusal(`IDML XML part ${entry.name} has no root element`, 'export a non-empty well-formed XML part')
      return { name: entry.name, document, all }
    })
}

function page(element: Element): IdmlPage {
  const id = attribute(element, 'Self')
  if (!id) throw refusal('an IDML Page has no Self identifier', 'give every Page a Self identifier')
  return { id, appliedMaster: attribute(element, 'AppliedMaster'), stories: [] }
}

type Transform = [number, number, number, number, number, number]
type Point = [number, number]

const IDENTITY: Transform = [1, 0, 0, 1, 0, 0]

function transform(element: Element): Transform {
  const values = (attribute(element, 'ItemTransform') ?? '').trim().split(/\s+/).map(Number)
  return values.length === 6 && values.every(Number.isFinite) ? (values as Transform) : IDENTITY
}

function compose(parent: Transform, child: Transform): Transform {
  const [a, b, c, d, x, y] = parent
  const [e, f, g, h, u, v] = child
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y]
}

function apply(value: Transform, point: Point): Point {
  return [value[0] * point[0] + value[2] * point[1] + value[4], value[1] * point[0] + value[3] * point[1] + value[5]]
}

function pageArea(element: Element): Point[] | undefined {
  const bounds = (attribute(element, 'GeometricBounds') ?? '').trim().split(/\s+/).map(Number)
  if (bounds.length !== 4 || !bounds.every(Number.isFinite)) return undefined
  const [top, left, bottom, right] = bounds as [number, number, number, number]
  const matrix = transform(element)
  return [apply(matrix, [left, top]), apply(matrix, [right, top]), apply(matrix, [right, bottom]), apply(matrix, [left, bottom])]
}

function frameCenter(element: Element, matrix: Transform): Point | undefined {
  const anchors = elements(element)
    .map((candidate) => attribute(candidate, 'Anchor'))
    .filter((value): value is string => value !== undefined)
    .map((value) => value.trim().split(/\s+/).map(Number))
    .filter((value): value is [number, number] => value.length === 2 && value.every(Number.isFinite))
    .map((point) => apply(matrix, point))
  if (anchors.length === 0) return undefined
  const xs = anchors.map(([x]) => x)
  const ys = anchors.map(([, y]) => y)
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

function contains(area: Point[], [x, y]: Point): boolean {
  let inside = false
  for (let index = 0, previous = area.length - 1; index < area.length; previous = index, index += 1) {
    const [xi, yi] = area[index] as Point
    const [xj, yj] = area[previous] as Point
    if (yi === yj && y === yi && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) return true
    const crosses = yi > y !== yj > y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

interface FramePlacement {
  story: string
  center?: Point
  preference?: IdmlFramePreference
}

function framePlacement(element: Element, matrix: Transform): FramePlacement | undefined {
  const story = attribute(element, 'ParentStory')
  if (!story) return undefined
  const preference = elements(element, 'TextFramePreference')[0]
  return {
    story,
    center: frameCenter(element, matrix),
    ...(preference
      ? {
          preference: {
            columns: numberAttribute(preference, 'TextColumnCount', 1),
            gutter: numberAttribute(preference, 'TextColumnGutter', 0),
          },
        }
      : {}),
  }
}

function spreadFrames(spread: Element): FramePlacement[] {
  const result: FramePlacement[] = []
  const pending = [...spread.children].reverse().map((node) => ({ node, matrix: IDENTITY }))
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || !isTag(current.node)) continue
    const name = localName(current.node.name)
    if (name === 'Page' || name === 'Spread' || name === 'MasterSpread') continue
    const matrix = name === 'Group' || name === 'TextFrame' ? compose(current.matrix, transform(current.node)) : current.matrix
    if (name === 'TextFrame') {
      const placement = framePlacement(current.node, matrix)
      if (placement) result.push(placement)
      continue
    }
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: current.node.children[index] as AnyNode, matrix })
    }
  }
  return result
}

function placeStories(
  element: Element,
  pageElements: Element[],
  pages: IdmlPage[],
  report: ReportCollector,
  framePreferences: Map<string, IdmlFramePreference>,
): Set<string> {
  const areas = pageElements.map(pageArea)
  const frameStories = new Set<string>()
  for (const frame of spreadFrames(element)) {
    frameStories.add(frame.story)
    const existing = framePreferences.get(frame.story)
    if (frame.preference && !existing) framePreferences.set(frame.story, frame.preference)
    else if (frame.preference && existing && frame.preference.gutter !== existing.gutter) {
      report.add(report.unsupportedElements, 'differing body frame gutters', frame.story)
    }
    const pageIndex = frame.center ? areas.findIndex((area) => area !== undefined && contains(area, frame.center as Point)) : -1
    const target = pages[pageIndex]
    if (target && !target.stories.includes(frame.story)) target.stories.push(frame.story)
    else if (pageIndex < 0) report.add(report.unsupportedElements, 'TextFrame off page', frame.story)
  }
  return frameStories
}

function spreads(
  parts: ParsedPart[],
  kind: 'Spread' | 'MasterSpread',
  orderedNames: string[],
  report: ReportCollector,
  framePreferences: Map<string, IdmlFramePreference>,
): { values: (IdmlSpread | IdmlMasterSpread)[]; frameStories: Set<string> } {
  const result: (IdmlSpread | IdmlMasterSpread)[] = []
  const frameStories = new Set<string>()
  const byName = new Map(parts.map((part) => [part.name, part]))
  const named = new Set(orderedNames)
  const unlisted = parts.filter(
    (part) => !named.has(part.name) && part.all.some((element) => localName(element.name) === kind && attribute(element, 'Self')),
  ).length
  if (unlisted > 0) report.add(report.unsupportedElements, 'unlisted spread part', kind, unlisted)
  for (const name of orderedNames) {
    const part = byName.get(name)
    if (!part) {
      throw refusal(`designmap.xml ${kind} src ${name} has no matching ZIP entry`, `add the named ${kind} part to the package`)
    }
    for (const element of part.all.filter((candidate) => localName(candidate.name) === kind)) {
      const id = attribute(element, 'Self')
      if (!id) continue
      const pageElements = elements(element, 'Page')
      const pages = pageElements.map(page)
      for (const story of placeStories(element, pageElements, pages, report, framePreferences)) frameStories.add(story)
      result.push({ id, pages })
    }
  }
  return { values: result, frameStories }
}

function spreadSources(document: ParsedPart, kind: 'Spread' | 'MasterSpread'): string[] {
  return document.all
    .filter((element) => localName(element.name) === kind)
    .map((element) => attribute(element, 'src'))
    .filter((source): source is string => source !== undefined)
}

function unsupported(parts: ParsedPart[], report: ReportCollector): Map<string, number> {
  const counts = report.unsupportedElements
  for (const part of parts) {
    if (part.name.startsWith('Stories/') || part.name.endsWith('/Styles.xml') || part.name.endsWith('/Graphic.xml')) continue
    for (const element of part.all) {
      const name = localName(element.name)
      if (MAPPED_ELEMENTS.has(name)) continue
      report.add(counts, name, part.name)
    }
  }
  return counts
}

export function idmlModel(entries: ZipEntry[], limits: IdmlLimits = IDML_LIMITS): IdmlModel {
  const parts = parseParts(entries, limits)
  const designmap = parts.find((part) => part.name === 'designmap.xml')
  if (!designmap) throw refusal('the IDML designmap.xml entry is missing', 'add the required designmap.xml entry')
  const document = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'Document')
  const preference = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'DocumentPreference')
  if (!document) throw refusal('designmap.xml has no IDML Document element', 'export a valid IDML design map')
  if (!preference) throw refusal('IDML DocumentPreference is missing', 'export document preferences with the package')
  const margin = parts.flatMap((part) => part.all).find((element) => localName(element.name) === 'MarginPreference')
  const binding = attribute(preference, 'PageBinding') ?? attribute(document, 'PageBinding') ?? 'LeftToRight'
  if (binding !== 'LeftToRight' && binding !== 'RightToLeft') {
    throw refusal(`IDML PageBinding ${binding} is not supported`, 'use LeftToRight or RightToLeft page binding')
  }
  const report = new ReportCollector()
  const unsupportedCounts = unsupported(parts, report)
  const framePreferences = new Map<string, IdmlFramePreference>()
  const spreadResult = spreads(parts, 'Spread', spreadSources(designmap, 'Spread'), report, framePreferences)
  const masterResult = spreads(parts, 'MasterSpread', spreadSources(designmap, 'MasterSpread'), report, framePreferences)
  const masterStoryIds = [...masterResult.frameStories].filter((story) => !spreadResult.frameStories.has(story))
  for (const story of masterStoryIds) report.add(report.unsupportedElements, 'master story', story)
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
    spreads: spreadResult.values as IdmlSpread[],
    masterSpreads: masterResult.values as IdmlMasterSpread[],
    stories: parseStories(parts, framePreferences),
    masterStoryIds,
    partsRead: parts.map((part) => part.name),
    unsupportedElements: Object.fromEntries([...unsupportedCounts].sort(([left], [right]) => left.localeCompare(right))),
    styles: parts.flatMap((part) => (part.name.endsWith('/Styles.xml') || part.name === 'Resources/Styles.xml' ? parseStyles(part.all, part.name) : [])),
    swatches: parts.flatMap((part) => (part.name.endsWith('/Graphic.xml') || part.name === 'Resources/Graphic.xml' ? parseSwatches(part.all) : [])),
    report: report.data(),
  }
}
