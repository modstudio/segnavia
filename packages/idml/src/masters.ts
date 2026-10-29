import { BOOK_PARENT_NAMES, type BookSectionParents, type ParentPage, type ParentPageMargin } from '@segnavia/format'
import serialize from 'dom-serializer'
import { Element } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import { logicalMargin } from './margins.ts'
import type { IdmlModel } from './model.ts'
import { positionedBoxStyle } from './positioned-box.ts'
import type { ReportCollector } from './report.ts'
import { storyHtml } from './stories.ts'
import type { StyleMapper } from './styles.ts'
import type { IdmlBounds, IdmlMargin, IdmlMasterPage, IdmlMasterSpread, IdmlPage, IdmlStory, IdmlTextVariable } from './types.ts'

export const IDML_NONE_MASTER = 'n'

export interface MasterMapping {
  parents: ParentPage[]
  css: string
  bookMargin?: ParentPageMargin
  parentFor(master: string | undefined, role: 'recto' | 'verso', location: string): string
  mappedStories: Set<string>
  marginFor(page: IdmlPage, ordinal?: number): IdmlMargin
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'master'
function roleFor(page: IdmlPage, rtl: boolean, ordinal?: number): 'recto' | 'verso' {
  if (!page.side || page.side === 'single') return (ordinal ?? 0) % 2 === 0 ? 'recto' : 'verso'
  return page.side === (rtl ? 'left' : 'right') ? 'recto' : 'verso'
}

function masterPage(master: IdmlMasterSpread, role: 'recto' | 'verso', rtl: boolean): IdmlMasterPage | undefined {
  if (master.pages.length === 1) return master.pages[0]
  const side = role === 'recto' ? (rtl ? 'left' : 'right') : rtl ? 'right' : 'left'
  return master.pages.find((page) => page.side === side)
}

function parentName(master: IdmlMasterSpread, role: 'recto' | 'verso'): string {
  return `idml-${slug(master.name)}-${master.pages.length === 1 ? 'recto' : role}`
}

function frameRegion(page: IdmlMasterPage, frame: IdmlMasterPage['frames'][number], height: number): 'head' | 'foot' | undefined {
  const bottom = frame.bounds.top + frame.bounds.height
  if (bottom <= page.margin.top) return 'head'
  if (frame.bounds.top >= height - page.margin.bottom) return 'foot'
  return undefined
}

interface ParentBuildContext {
  model: IdmlModel
  variables: IdmlTextVariable[]
  styles: StyleMapper
  report: ReportCollector
  rtl: boolean
  stories: Map<string, IdmlStory>
  mappedStories: Set<string>
  css: string[]
}

function regionHtml(master: IdmlMasterSpread, page: IdmlMasterPage, region: 'head' | 'foot', context: ParentBuildContext): string | undefined {
  const boxes: Element[] = []
  for (const frame of page.frames) {
    if (frameRegion(page, frame, context.model.preferences.pageHeight) !== region) continue
    const story = context.stories.get(frame.story)
    if (!story) {
      context.report.add(context.report.unsupportedElements, 'master story missing', `${master.name}#${frame.id}`)
      continue
    }
    const className = `idml-master-frame-${context.css.length}`
    const mapped = storyHtml(
      { ...story, textVariables: context.variables, master: true },
      context.styles,
      context.report,
      context.rtl ? 'rtl' : 'ltr',
      undefined,
    )
    const nodes = parseDocument(mapped.html, { xmlMode: false }).children
    boxes.push(new Element('div', { class: className }, nodes))
    const blockStart = region === 'head' ? frame.bounds.top : frame.bounds.top - (context.model.preferences.pageHeight - page.margin.bottom)
    const bounds: IdmlBounds = {
      left: frame.bounds.left,
      top: blockStart,
      right: frame.bounds.left + frame.bounds.width,
      bottom: blockStart + frame.bounds.height,
    }
    context.css.push(
      `:where(.${className}){${positionedBoxStyle(bounds, {
        pageWidth: context.model.preferences.pageWidth,
        margin: page.margin,
        rtl: context.rtl,
        blockOrigin: 0,
        unit: 'mm',
      })}}`,
    )
    context.mappedStories.add(frame.story)
  }
  if (boxes.length === 0) return undefined
  return serialize(new Element('div', { class: 'idml-master-region' }, boxes), { xmlMode: false, encodeEntities: 'utf8' })
}

function pageSide(page: IdmlMasterPage, role: 'recto' | 'verso', rtl: boolean): 'left' | 'right' {
  if (page.side === 'left' || page.side === 'right') return page.side
  return role === 'recto' ? (rtl ? 'left' : 'right') : rtl ? 'right' : 'left'
}

function buildParent(
  master: IdmlMasterSpread,
  role: 'recto' | 'verso',
  byId: Map<string, IdmlMasterSpread>,
  context: ParentBuildContext,
): ParentPage | undefined {
  const page = masterPage(master, role, context.rtl)
  if (!page) return undefined
  const base = master.basedOn ? byId.get(master.basedOn) : undefined
  const head = regionHtml(master, page, 'head', context)
  const foot = regionHtml(master, page, 'foot', context)
  for (const frame of page.frames) {
    if (!frameRegion(page, frame, context.model.preferences.pageHeight)) {
      context.report.add(context.report.unsupportedElements, 'master TextFrame', `${master.name}#${frame.id}`)
    }
  }
  return {
    name: parentName(master, role),
    ...(base ? { basedOn: parentName(base, role) } : {}),
    margin: logicalMargin(page.margin, pageSide(page, role, context.rtl)),
    ...(head ? { head } : {}),
    ...(foot ? { foot } : {}),
  }
}

function reportExtraPages(master: IdmlMasterSpread, selected: Set<string>, report: ReportCollector): void {
  for (const page of master.pages) {
    if (selected.has(page.id)) continue
    report.add(report.unsupportedElements, 'master page', `${master.name}#${page.id}`)
    for (const frame of page.frames) report.add(report.unsupportedElements, 'master TextFrame', `${master.name}#${frame.id}`)
  }
}

function buildParents(masters: IdmlMasterSpread[], byId: Map<string, IdmlMasterSpread>, context: ParentBuildContext): ParentPage[] {
  const result: ParentPage[] = []
  for (const master of masters) {
    const roles: ('recto' | 'verso')[] = master.pages.length === 1 ? ['recto'] : ['recto', 'verso']
    const selected = new Set<string>()
    for (const role of roles) {
      const page = masterPage(master, role, context.rtl)
      if (page) selected.add(page.id)
      const parent = buildParent(master, role, byId, context)
      if (parent) result.push(parent)
    }
    reportExtraPages(master, selected, context.report)
    for (const item of master.unmappedItems) context.report.add(context.report.unsupportedElements, `master ${item.type}`, `${master.name}#${item.id}`)
  }
  return result
}

function emittedMasters(model: IdmlModel, applied: Set<string>): IdmlMasterSpread[] {
  const byId = new Map(model.masterSpreads.map((master) => [master.id, master]))
  const emitted = new Set(applied)
  for (const id of emitted) {
    const basedOn = byId.get(id)?.basedOn
    if (basedOn) emitted.add(basedOn)
  }
  return model.masterSpreads.filter((master) => emitted.has(master.id))
}

function appliedBookMargin(model: IdmlModel, applied: Set<string>, report: ReportCollector): ParentPageMargin | undefined {
  const masters = model.masterSpreads.filter((master) => applied.has(master.id))
  if (masters.length !== applied.size) return undefined
  const pages = masters.flatMap((master) => master.pages.map((page) => ({ master, page })))
  const first = pages[0]?.page.margin
  if (!first) return undefined
  const signature = (margin: typeof first) => `${margin.top},${margin.bottom},${margin.left},${margin.right}`
  if (pages.some(({ page }) => signature(page.margin) !== signature(first))) {
    for (const master of masters) {
      const margins = [...new Set(master.pages.map((page) => signature(page.margin)))]
      report.add(report.unsupportedElements, 'master margins disagree', `${master.name}:${margins.join('|')}`)
    }
    return undefined
  }
  return logicalMargin(first, model.preferences.binding === 'right-to-left' ? 'left' : 'right')
}

export function mapMasters(model: IdmlModel, variables: IdmlTextVariable[], styles: StyleMapper, report: ReportCollector): MasterMapping {
  const rtl = model.preferences.binding === 'right-to-left'
  const applied = new Set(
    model.spreads.flatMap((spread) => spread.pages.map((page) => page.appliedMaster).filter((id): id is string => Boolean(id && id !== IDML_NONE_MASTER))),
  )
  const masters = emittedMasters(model, applied)
  const byId = new Map(model.masterSpreads.map((master) => [master.id, master]))
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      const id = page.appliedMaster
      if (id && id !== IDML_NONE_MASTER && !byId.has(id)) {
        report.addOnce(report.unsupportedElements, `applied master unknown:${id}`, page.id)
      }
    }
  }
  const css = [':where(.idml-master-region){position:relative;block-size:100%}']
  const mappedStories = new Set<string>()
  const context: ParentBuildContext = {
    model,
    variables,
    styles,
    report,
    rtl,
    stories: new Map(model.stories.map((story) => [story.id, story])),
    mappedStories,
    css,
  }
  const parents = buildParents(masters, byId, context)
  if (model.spreads.some((spread) => spread.pages.some((page) => !page.appliedMaster || page.appliedMaster === IDML_NONE_MASTER))) {
    parents.push({ name: 'idml-none', basedOn: BOOK_PARENT_NAMES.blank })
  }
  for (const story of model.masterStoryIds) if (!mappedStories.has(story)) report.add(report.unsupportedElements, 'master story', story)
  const parentFor = (masterId: string | undefined, role: 'recto' | 'verso', location: string): string => {
    if (!masterId || masterId === IDML_NONE_MASTER) return 'idml-none'
    const master = byId.get(masterId)
    if (master && applied.has(masterId)) return parentName(master, role)
    report.addOnce(report.unsupportedElements, `applied master unknown:${masterId}`, location)
    return role === 'recto' ? BOOK_PARENT_NAMES.recto : BOOK_PARENT_NAMES.verso
  }
  const marginFor = (page: IdmlPage, ordinal?: number): IdmlMargin => {
    const master = page.appliedMaster ? byId.get(page.appliedMaster) : undefined
    const resolved = master ? masterPage(master, roleFor(page, rtl, ordinal), rtl) : undefined
    return resolved?.margin ?? model.preferences.margin
  }
  return { parents, css: css.join(''), bookMargin: appliedBookMargin(model, applied, report), parentFor, mappedStories, marginFor }
}

export interface PageUse {
  page: IdmlPage
  ordinal: number
}

export interface StoryOpening {
  page: IdmlPage
  role: 'recto' | 'verso'
}

export function storyPageUses(model: IdmlModel): Map<string, PageUse[]> {
  const result = new Map<string, PageUse[]>()
  let ordinal = 0
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const story of page.stories) result.set(story, [...(result.get(story) ?? []), { page, ordinal }])
      ordinal += 1
    }
  }
  return result
}

export function openingPage(story: string, model: IdmlModel, pages: Map<string, PageUse[]>): StoryOpening | undefined {
  const rtl = model.preferences.binding === 'right-to-left'
  const first = pages.get(story)?.[0]
  return first ? { page: first.page, role: roleFor(first.page, rtl, first.ordinal) } : undefined
}

export function chapterParents(
  story: string,
  model: IdmlModel,
  pages: Map<string, PageUse[]>,
  mapping: MasterMapping,
  report: ReportCollector,
): BookSectionParents | undefined {
  const rtl = model.preferences.binding === 'right-to-left'
  const uses = pages.get(story)
  const first = uses?.[0]
  if (!first) return undefined
  const firstRole = roleFor(first.page, rtl, first.ordinal)
  const result: BookSectionParents = { opener: mapping.parentFor(first.page.appliedMaster, firstRole, first.page.id) }
  for (const role of ['recto', 'verso'] as const) {
    const candidates = uses.slice(1).filter((entry) => roleFor(entry.page, rtl, entry.ordinal) === role)
    if (candidates.length === 0) continue
    const counts = new Map<string, number>()
    for (const entry of candidates) {
      const id = entry.page.appliedMaster ?? IDML_NONE_MASTER
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const chosen = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (chosen) result[role] = mapping.parentFor(chosen, role, candidates[0]?.page.id ?? story)
    if (chosen && counts.size > 1) report.mixedMasterChapters.push({ chapter: story, side: role, masters: [...counts.keys()], chosen })
  }
  return result
}
