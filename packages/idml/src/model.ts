import { type Element, isTag } from 'domhandler'
import { parseFonts } from './fonts.ts'
import { FramePreferenceIndex } from './frame-preferences.ts'
import { IDML_LIMITS, type IdmlLimits } from './limits.ts'
import { readMargin } from './margins.ts'
import { type ParsedPart, parseParts } from './parse-parts.ts'
import { attachPlacements, placementBounds as bounds, contains, type FramePlacement, pageArea, type SpreadPlacements, spreadPlacements } from './placements.ts'
import { refusal } from './refusal.ts'
import { type IdmlReportData, ReportCollector } from './report.ts'
import { parseStories } from './story-model.ts'
import { parseStyles, parseSwatches } from './styles.ts'
import type {
  IdmlDocumentPreferences,
  IdmlFont,
  IdmlFramePreference,
  IdmlMasterFrame,
  IdmlMasterSpread,
  IdmlPage,
  IdmlSpread,
  IdmlStory,
  IdmlStyle,
  IdmlSwatch,
  IdmlTextVariable,
} from './types.ts'
import { collectUnsupportedElements, GRAPHIC_ELEMENTS, SHAPE_ELEMENTS } from './unsupported-elements.ts'
import { attribute, elements, localName, numberAttribute } from './xml.ts'
import type { ZipEntry } from './zip.ts'

export type { IdmlDocumentPreferences, IdmlMargin, IdmlMasterPage, IdmlMasterSpread, IdmlPage, IdmlSpread, IdmlStory } from './types.ts'

export interface IdmlModel {
  id: string
  preferences: IdmlDocumentPreferences
  spreads: IdmlSpread[]
  masterSpreads: IdmlMasterSpread[]
  stories: IdmlStory[]
  masterStoryIds: string[]
  partsRead: string[]
  styles?: IdmlStyle[]
  fonts?: IdmlFont[]
  swatches?: IdmlSwatch[]
  bodyFramePreferences?: IdmlFramePreference[]
  textVariables?: IdmlTextVariable[]
  report?: IdmlReportData
}

function boolAttribute(element: Element, name: string, fallback: boolean): boolean {
  const raw = attribute(element, name)
  if (raw === undefined) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw refusal(`IDML ${name} must be true or false`, `set ${name} to true or false`)
}

function page(element: Element): IdmlPage {
  const id = attribute(element, 'Self')
  if (!id) throw refusal('an IDML Page has no Self identifier', 'give every Page a Self identifier')
  return { id, appliedMaster: attribute(element, 'AppliedMaster'), stories: [], side: 'single' }
}

function assignSides(pageElements: Element[], pages: IdmlPage[]): void {
  if (pages.length < 2) return
  const centers = pageElements.map((element) => {
    const area = pageArea(element)
    return area ? bounds(area) : undefined
  })
  const order = centers.map((area, index) => ({ index, x: area ? (area.left + area.right) / 2 : index })).sort((a, b) => a.x - b.x)
  const left = order[0]
  const right = order.at(-1)
  const leftPage = left ? pages[left.index] : undefined
  const rightPage = right ? pages[right.index] : undefined
  if (leftPage) leftPage.side = 'left'
  if (rightPage && right?.index !== left?.index) rightPage.side = 'right'
}

function masterFrames(frames: FramePlacement[], pageElements: Element[], pages: IdmlPage[]): IdmlMasterFrame[][] {
  const result = pages.map(() => [] as IdmlMasterFrame[])
  const areas = pageElements.map((candidate) => {
    const area = pageArea(candidate)
    return area ? bounds(area) : undefined
  })
  for (const frame of frames) {
    const absolute = frame.bounds
    const center = frame.center
    if (!absolute || !center) continue
    const index = pageElements.findIndex((candidate) => {
      const area = pageArea(candidate)
      return area ? contains(area, center) : false
    })
    const area = areas[index]
    if (index < 0 || !area) continue
    result[index]?.push({
      id: frame.id,
      story: frame.story,
      bounds: { left: absolute.left - area.left, top: absolute.top - area.top, width: absolute.right - absolute.left, height: absolute.bottom - absolute.top },
    })
  }
  return result
}

function masterSpread(element: Element, pageElements: Element[], pages: IdmlPage[], placements: SpreadPlacements): IdmlMasterSpread {
  const frames = masterFrames(placements.frames, pageElements, pages)
  const prefix = attribute(element, 'NamePrefix') ?? ''
  const base = attribute(element, 'BaseName') ?? attribute(element, 'Name') ?? attribute(element, 'Self') ?? 'master'
  const name = prefix ? `${prefix}-${base}` : base
  const frameIds = new Set(frames.flat().map((frame) => frame.id))
  const unmappedItems = element.children.flatMap((child) => {
    if (!isTag(child)) return []
    const type = localName(child.name)
    if (type === 'Page' || type === 'Properties' || type === 'Group' || type === 'Link') return []
    if ((SHAPE_ELEMENTS as readonly string[]).includes(type) || (GRAPHIC_ELEMENTS as readonly string[]).includes(type)) return []
    const id = attribute(child, 'Self') ?? type
    if (type === 'TextFrame' && frameIds.has(id)) return []
    return [{ type, id }]
  })
  return {
    id: attribute(element, 'Self') ?? base,
    name,
    ...(attribute(element, 'BasedOn') ? { basedOn: attribute(element, 'BasedOn') } : {}),
    pages: pages.map((value, index) => ({
      ...value,
      margin: readMargin(elements(pageElements[index] as Element, 'MarginPreference')[0]),
      frames: frames[index] ?? [],
    })),
    unmappedItems,
  }
}

function placeStories(
  frames: FramePlacement[],
  pageElements: Element[],
  pages: IdmlPage[],
  report: ReportCollector,
  framePreferences: FramePreferenceIndex,
): Set<string> {
  const areas = pageElements.map(pageArea)
  const frameStories = new Set<string>()
  for (const frame of frames) {
    frameStories.add(frame.story)
    framePreferences.add(frame.story, frame.preference)
    const center = frame.center
    const pageIndex = center ? areas.findIndex((area) => area !== undefined && contains(area, center)) : -1
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
  framePreferences: FramePreferenceIndex,
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
      assignSides(pageElements, pages)
      const placements = spreadPlacements(element, name)
      for (const story of placeStories(placements.frames, pageElements, pages, report, framePreferences)) frameStories.add(story)
      attachPlacements(placements, pageElements, pages, report)
      result.push(kind === 'MasterSpread' ? masterSpread(element, pageElements, pages, placements) : { id, pages })
    }
  }
  return { values: result, frameStories }
}

function textVariables(designmap: ParsedPart): IdmlTextVariable[] {
  return designmap.all
    .filter((element) => localName(element.name) === 'TextVariable')
    .flatMap((element) => {
      const id = attribute(element, 'Self')
      if (!id) return []
      const preference = element.children.find((child): child is Element => isTag(child) && localName(child.name).endsWith('Preference'))
      return [
        {
          id,
          name: attribute(element, 'Name') ?? id,
          type: attribute(element, 'VariableType') ?? 'unknown',
          appliedCharacterStyle: preference ? attribute(preference, 'AppliedCharacterStyle') : undefined,
          searchStrategy: preference ? attribute(preference, 'SearchStrategy') : undefined,
          location: `designmap.xml#${id}`,
        },
      ]
    })
}

function spreadSources(document: ParsedPart, kind: 'Spread' | 'MasterSpread'): string[] {
  return document.all
    .filter((element) => localName(element.name) === kind)
    .map((element) => attribute(element, 'src'))
    .filter((source): source is string => source !== undefined)
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
  collectUnsupportedElements(parts, report)
  const framePreferences = new FramePreferenceIndex()
  const spreadResult = spreads(parts, 'Spread', spreadSources(designmap, 'Spread'), report, framePreferences)
  const masterResult = spreads(parts, 'MasterSpread', spreadSources(designmap, 'MasterSpread'), report, new FramePreferenceIndex())
  const masterStoryIds = [...masterResult.frameStories].filter((story) => !spreadResult.frameStories.has(story))
  return {
    id: attribute(document, 'Self') ?? 'IDML document',
    preferences: {
      pageWidth: numberAttribute(preference, 'PageWidth'),
      pageHeight: numberAttribute(preference, 'PageHeight'),
      facingPages: boolAttribute(preference, 'FacingPages', true),
      binding: binding === 'RightToLeft' ? 'right-to-left' : 'left-to-right',
      margin: readMargin(margin),
    },
    spreads: spreadResult.values as IdmlSpread[],
    masterSpreads: masterResult.values as IdmlMasterSpread[],
    stories: parseStories(parts, framePreferences, report),
    bodyFramePreferences: framePreferences.values(),
    textVariables: textVariables(designmap),
    masterStoryIds,
    partsRead: parts.map((part) => part.name),
    styles: parts.flatMap((part) => (part.name.endsWith('/Styles.xml') || part.name === 'Resources/Styles.xml' ? parseStyles(part.all, part.name) : [])),
    fonts: parts.flatMap((part) => (part.name.endsWith('/Fonts.xml') || part.name === 'Resources/Fonts.xml' ? parseFonts(part.all) : [])),
    swatches: parts.flatMap((part) => (part.name.endsWith('/Graphic.xml') || part.name === 'Resources/Graphic.xml' ? parseSwatches(part.all) : [])),
    report: report.data(),
  }
}
