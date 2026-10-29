import serialize from 'dom-serializer'
import { Element } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import type { IdmlModel } from './model.ts'
import { positionedBoxStyle } from './positioned-box.ts'
import type { ReportCollector } from './report.ts'
import { type StoryHtmlResult, storyHtml } from './stories.ts'
import type { StyleMapper } from './styles.ts'
import type { IdmlBounds, IdmlMasterPage, IdmlMasterSpread, IdmlStory, IdmlTextVariable } from './types.ts'

const NONE_MASTER = 'n'
const MAX_BASE_DEPTH = 8

export interface ParentBuildContext {
  model: IdmlModel
  variables: IdmlTextVariable[]
  styles: StyleMapper
  report: ReportCollector
  rtl: boolean
  stories: Map<string, IdmlStory>
  mappedStories: Set<string>
  css: string[]
  renderStory?: (story: IdmlStory) => StoryHtmlResult
}

export function masterPage(master: IdmlMasterSpread, role: 'recto' | 'verso', rtl: boolean): IdmlMasterPage | undefined {
  if (master.pages.length === 1) return master.pages[0]
  const side = role === 'recto' ? (rtl ? 'left' : 'right') : rtl ? 'right' : 'left'
  return master.pages.find((page) => page.side === side)
}

export function frameRegion(page: IdmlMasterPage, frame: IdmlMasterPage['frames'][number], height: number): 'head' | 'foot' | undefined {
  const bottom = frame.bounds.top + frame.bounds.height
  if (bottom <= page.margin.top) return 'head'
  if (frame.bounds.top >= height - page.margin.bottom) return 'foot'
  return undefined
}

function itemBaseId(master: IdmlMasterSpread, page: IdmlMasterPage): string | undefined {
  if (master.showMasterItems === false || page.showMasterItems === false) return undefined
  if (page.appliedMaster && page.appliedMaster !== NONE_MASTER) return page.appliedMaster
  return master.basedOn
}

function ownBoxes(master: IdmlMasterSpread, page: IdmlMasterPage, region: 'head' | 'foot', context: ParentBuildContext): Element[] {
  const boxes: Element[] = []
  for (const frame of page.frames) {
    if (frameRegion(page, frame, context.model.preferences.pageHeight) !== region) continue
    const story = context.stories.get(frame.story)
    if (!story) {
      context.report.add(context.report.unsupportedElements, 'master story missing', `${master.name}#${frame.id}`)
      continue
    }
    const className = `idml-master-frame-${context.css.length}`
    const mapped = context.renderStory
      ? context.renderStory(story)
      : storyHtml({ ...story, textVariables: context.variables, master: true }, context.styles, context.report, context.rtl ? 'rtl' : 'ltr', undefined)
    boxes.push(new Element('div', { class: className }, parseDocument(mapped.html, { xmlMode: false }).children))
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
  return boxes
}

function regionBoxes(
  master: IdmlMasterSpread,
  page: IdmlMasterPage,
  role: 'recto' | 'verso',
  region: 'head' | 'foot',
  byId: Map<string, IdmlMasterSpread>,
  context: ParentBuildContext,
  ancestors: Set<string>,
  depth: number,
): Element[] {
  const boxes: Element[] = []
  const baseId = itemBaseId(master, page)
  if (baseId) {
    const location = `${master.name}#${page.id}`
    if (ancestors.has(baseId)) {
      context.report.addOnce(context.report.unsupportedElements, 'master base cycle', location)
    } else if (depth >= MAX_BASE_DEPTH) {
      context.report.addOnce(context.report.unsupportedElements, 'master base depth', location)
    } else {
      const base = byId.get(baseId)
      const basePage = base ? masterPage(base, role, context.rtl) : undefined
      if (base && basePage) {
        const nextAncestors = new Set(ancestors)
        nextAncestors.add(base.id)
        boxes.push(...regionBoxes(base, basePage, role, region, byId, context, nextAncestors, depth + 1))
      }
    }
  }
  boxes.push(...ownBoxes(master, page, region, context))
  return boxes
}

export function regionHtml(
  master: IdmlMasterSpread,
  page: IdmlMasterPage,
  role: 'recto' | 'verso',
  region: 'head' | 'foot',
  byId: Map<string, IdmlMasterSpread>,
  context: ParentBuildContext,
): string | undefined {
  const boxes = regionBoxes(master, page, role, region, byId, context, new Set([master.id]), 0)
  if (boxes.length === 0) return undefined
  return serialize(new Element('div', { class: 'idml-master-region' }, boxes), { xmlMode: false, encodeEntities: 'utf8' })
}
