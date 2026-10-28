import { BOOK_PARENT_NAMES, type BookSectionParents, MM_PER_PT, type ParentPage } from '@segnavia/format'
import serialize from 'dom-serializer'
import { Element } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import type { IdmlModel } from './model.ts'
import type { ReportCollector } from './report.ts'
import { storyHtml } from './stories.ts'
import type { StyleMapper } from './styles.ts'
import type { IdmlMasterPage, IdmlMasterSpread, IdmlPage, IdmlStory } from './types.ts'

export interface MasterMapping {
  parents: ParentPage[]
  css: string
  parentFor(master: string | undefined, role: 'recto' | 'verso'): string
  mappedStories: Set<string>
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'master'
const mm = (points: number) => `${Number((points * MM_PER_PT).toFixed(6))}mm`

function roleFor(page: IdmlPage, rtl: boolean, ordinal?: number): 'recto' | 'verso' {
  if (!page.side || page.side === 'single') return (ordinal ?? 0) % 2 === 0 ? 'recto' : 'verso'
  return page.side === (rtl ? 'left' : 'right') ? 'recto' : 'verso'
}

function masterPage(master: IdmlMasterSpread, role: 'recto' | 'verso', rtl: boolean): IdmlMasterPage | undefined {
  if (master.pages.length === 1) return master.pages[0]
  return master.pages.find((page) => roleFor(page, rtl) === role)
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
    const className = `idml-master-frame-${context.css.length + 1}`
    const mapped = storyHtml(
      { ...story, textVariables: context.model.textVariables, master: true },
      context.styles,
      context.report,
      context.rtl ? 'rtl' : 'ltr',
      undefined,
    )
    const nodes = parseDocument(mapped.html, { xmlMode: false }).children
    boxes.push(new Element('div', { class: className }, nodes))
    const right = frame.bounds.left + frame.bounds.width
    const inlineStart = context.rtl ? context.model.preferences.pageWidth - page.margin.right - right : frame.bounds.left - page.margin.left
    const blockStart = region === 'head' ? frame.bounds.top : frame.bounds.top - (context.model.preferences.pageHeight - page.margin.bottom)
    context.css.push(
      `:where(.${className}){position:absolute;inset-inline-start:${mm(inlineStart)};inline-size:${mm(frame.bounds.width)};inset-block-start:${mm(blockStart)};block-size:${mm(frame.bounds.height)}}`,
    )
    context.mappedStories.add(frame.story)
  }
  if (boxes.length === 0) return undefined
  return serialize(new Element('div', { class: 'idml-master-region' }, boxes), { xmlMode: false, encodeEntities: 'utf8' })
}

function parentMargin(page: IdmlMasterPage, role: 'recto' | 'verso', rtl: boolean) {
  const side = !page.side || page.side === 'single' ? (role === 'recto' ? (rtl ? 'left' : 'right') : rtl ? 'right' : 'left') : page.side
  return {
    top: page.margin.top * MM_PER_PT,
    bottom: page.margin.bottom * MM_PER_PT,
    inner: (side === 'left' ? page.margin.right : page.margin.left) * MM_PER_PT,
    outer: (side === 'left' ? page.margin.left : page.margin.right) * MM_PER_PT,
  }
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
    if (!frameRegion(page, frame, context.model.preferences.pageHeight))
      context.report.add(context.report.unsupportedElements, 'master TextFrame', `${master.name}#${frame.id}`)
  }
  return {
    name: parentName(master, role),
    ...(base ? { basedOn: parentName(base, role) } : {}),
    margin: parentMargin(page, role, context.rtl),
    ...(head ? { head } : {}),
    ...(foot ? { foot } : {}),
  }
}

function buildParents(masters: IdmlMasterSpread[], byId: Map<string, IdmlMasterSpread>, context: ParentBuildContext): ParentPage[] {
  const result: ParentPage[] = []
  for (const master of masters) {
    const roles: ('recto' | 'verso')[] = master.pages.length === 1 ? ['recto'] : ['recto', 'verso']
    for (const role of roles) {
      const parent = buildParent(master, role, byId, context)
      if (parent) result.push(parent)
    }
    for (const item of master.unmappedItems) context.report.add(context.report.unsupportedElements, `master ${item.type}`, `${master.name}#${item.id}`)
  }
  return result
}

export function mapMasters(model: IdmlModel, styles: StyleMapper, report: ReportCollector): MasterMapping {
  const rtl = model.preferences.binding === 'right-to-left'
  const applied = new Set(
    model.spreads.flatMap((spread) => spread.pages.map((page) => page.appliedMaster).filter((id): id is string => Boolean(id && id !== 'n'))),
  )
  const masters = model.masterSpreads.filter((master) => applied.has(master.id))
  const byId = new Map(masters.map((master) => [master.id, master]))
  const css = [':where(.idml-master-region){position:relative;block-size:100%}']
  const mappedStories = new Set<string>()
  const context: ParentBuildContext = { model, styles, report, rtl, stories: new Map(model.stories.map((story) => [story.id, story])), mappedStories, css }
  const parents = buildParents(masters, byId, context)
  if (model.spreads.some((spread) => spread.pages.some((page) => !page.appliedMaster || page.appliedMaster === 'n'))) {
    parents.push({ name: 'idml-none', basedOn: BOOK_PARENT_NAMES.blank })
  }
  for (const story of model.masterStoryIds) if (!mappedStories.has(story)) report.add(report.unsupportedElements, 'master story', story)
  const parentFor = (masterId: string | undefined, role: 'recto' | 'verso'): string => {
    if (!masterId || masterId === 'n') return 'idml-none'
    const master = byId.get(masterId)
    return master ? parentName(master, role) : role === 'recto' ? BOOK_PARENT_NAMES.recto : BOOK_PARENT_NAMES.verso
  }
  return { parents, css: css.join(''), parentFor, mappedStories }
}

interface PageUse {
  page: IdmlPage
  ordinal: number
}

export function chapterParents(story: string, model: IdmlModel, mapping: MasterMapping, report: ReportCollector): BookSectionParents | undefined {
  const rtl = model.preferences.binding === 'right-to-left'
  const pages: PageUse[] = []
  let ordinal = 0
  for (const spread of model.spreads)
    for (const page of spread.pages) {
      if (page.stories.includes(story)) pages.push({ page, ordinal })
      ordinal += 1
    }
  const first = pages[0]
  if (!first) return undefined
  const firstRole = roleFor(first.page, rtl, first.ordinal)
  const result: BookSectionParents = { opener: mapping.parentFor(first.page.appliedMaster, firstRole) }
  for (const role of ['recto', 'verso'] as const) {
    const candidates = pages.slice(1).filter((entry) => roleFor(entry.page, rtl, entry.ordinal) === role)
    if (candidates.length === 0) continue
    const counts = new Map<string, number>()
    for (const entry of candidates) {
      const id = entry.page.appliedMaster ?? 'n'
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const chosen = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (chosen) result[role] = mapping.parentFor(chosen, role)
    if (counts.size > 1) report.add(report.unsupportedElements, `chapter masters:${story}:${role}:${[...counts.keys()].join(',')}=>${chosen}`, story)
  }
  return result
}
