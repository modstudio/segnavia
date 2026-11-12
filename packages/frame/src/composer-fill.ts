import {
  FILL_MAX_DEFAULT,
  FILL_MIN_DEFAULT,
  PREFLIGHT_DROPPED_IDS_LIMIT,
  PREFLIGHT_REGION_FIELD_LIMIT,
  type PreflightEntry,
  type PreflightRegion,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import {
  fillLimits,
  lastLineStart,
  mergeRegionFact,
  overflowMode,
  recordTruncatedRegion,
  regionRefusal,
  runFillStageOnce,
  truncatedRegion,
} from './composer-fill-policy.ts'
import { fillTemplateRegions, inkExcess } from './composer-page-dom.ts'

interface FillGeometry {
  parents: Array<{ textArea: { width: number; height: number } }>
}

function regionSubject(region: HTMLElement): string {
  const name = region.getAttribute('data-region') ?? region.getAttribute('data-segnavia-region') ?? ''
  const template =
    region.closest<HTMLElement>('[data-template]')?.getAttribute('data-template') ??
    region.closest<HTMLElement>('[data-segnavia-template]')?.getAttribute('data-segnavia-template')
  const parent = region.getAttribute('data-segnavia-parent')
  return `${template ?? parent ?? 'region'}:${name}`
}

function fillBlockExtent(region: HTMLElement): number {
  const bounds = region.getBoundingClientRect()
  const range = region.ownerDocument.createRange()
  range.selectNodeContents(region)
  const ink = range.getBoundingClientRect()
  return Math.max(region.scrollHeight, ink.bottom - bounds.top)
}

export function repeatFill(
  region: HTMLElement,
  definiteBlockSize = region.getBoundingClientRect().height,
  excessOf: (element: HTMLElement) => { block: number } = inkExcess,
  extentOf: (element: HTMLElement) => number = fillBlockExtent,
): PreflightRegion[] {
  const source = region.querySelector<HTMLElement>(':scope > [data-fill="repeat"]')
  if (!source) return []
  const name = region.getAttribute('data-region') ?? region.getAttribute('data-segnavia-region') ?? ''
  if (!Number.isFinite(definiteBlockSize) || definiteBlockSize <= 0)
    throw new Error(`Region ${name} has no definite block size; give the template or parent-page region a definite block size to clear this refusal.`)
  const limits = fillLimits(source.getAttribute('data-fill-min'), source.getAttribute('data-fill-max'))
  source.setAttribute('data-fill-index', '0')
  let count = 1
  let extent = extentOf(region)
  while (count < limits.max) {
    const copy = source.cloneNode(true) as HTMLElement
    copy.setAttribute('data-fill-index', String(count))
    region.append(copy)
    const nextBlockSize = region.getBoundingClientRect().height
    const nextExtent = extentOf(region)
    if (Math.abs(nextBlockSize - definiteBlockSize) > 0.5) {
      copy.remove()
      throw new Error(`Region ${name} has an indefinite block size that grows with its fill; give the region a definite block size to clear this refusal.`)
    }
    if (nextExtent <= extent + 0.5) {
      copy.remove()
      throw new Error(`Region ${name} cannot make block progress while filling; give the repeated child in-flow block ink to clear this refusal.`)
    }
    const excess = excessOf(region).block
    if (excess > 0.5 && count >= limits.min) {
      copy.remove()
      break
    }
    extent = nextExtent
    count += 1
  }
  const excess = excessOf(region).block
  if (count < limits.min || excess > 0.5)
    throw new Error(`Region ${name} cannot fit its data-fill minimum of ${limits.min}; lower data-fill-min or enlarge the region to clear this refusal.`)
  region.setAttribute('data-segnavia-fill-count', String(count))
  return [{ subject: regionSubject(region), fillCount: count }]
}

function fillTemplateHolder(
  root: ParentNode,
  template: HTMLElement,
  holder: HTMLElement,
  templateName: string,
  geometry: (name: string | null | undefined) => FillGeometry,
  defaultDirection: string,
  defaultLang: string,
): PreflightRegion[] {
  const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
  const area = geometry(flow?.getAttribute('data-page-geometry')).parents[0]?.textArea
  if (!area) throw new Error(`Template ${templateName} has no definite text area; configure a page parent to clear this refusal.`)
  const clone = template.cloneNode(true) as HTMLElement
  clone.removeAttribute('hidden')
  clone.removeAttribute('data-segnavia-template')
  clone.setAttribute('data-template', templateName)
  clone.style.cssText = `position:absolute;inset-block-start:0;inset-inline-start:-10000px;inline-size:${area.width}px;block-size:${area.height}px;overflow:visible;direction:${flow?.getAttribute('dir') ?? defaultDirection}`
  const lang = flow?.getAttribute('lang') ?? defaultLang
  if (lang) clone.setAttribute('lang', lang)
  fillTemplateRegions(clone, holder)
  ;(root as Document).body.append(clone)
  const facts: PreflightRegion[] = []
  for (const region of Array.from(clone.querySelectorAll<HTMLElement>('[data-region]'))) {
    const added = repeatFill(region, region.getBoundingClientRect().height)
    for (const fact of added) mergeRegionFact(facts, fact)
    if (added.length === 0) continue
    const name = region.getAttribute('data-region')
    const source = Array.from(holder.querySelectorAll<HTMLElement>('[data-region]')).find((candidate) => candidate.getAttribute('data-region') === name)
    if (source) source.replaceChildren(...Array.from(region.childNodes).map((child) => child.cloneNode(true)))
  }
  clone.remove()
  return facts
}

function fillTemplateSourceRegions(
  root: ParentNode,
  geometry: (name: string | null | undefined) => FillGeometry,
  defaultDirection: string,
  defaultLang: string,
): PreflightRegion[] {
  const facts: PreflightRegion[] = []
  for (const template of Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-template]'))) {
    const templateName = template.getAttribute('data-segnavia-template') ?? ''
    const holders = Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-templated-page]')).filter(
      (holder) => holder.getAttribute('data-template') === templateName,
    )
    for (const holder of holders) {
      for (const fact of fillTemplateHolder(root, template, holder, templateName, geometry, defaultDirection, defaultLang)) mergeRegionFact(facts, fact)
    }
  }
  return facts
}

export interface RegionOverflowOutcome {
  mode: 'grow' | 'truncate' | 'refuse'
  refusal?: string
  droppedIds?: string[]
}

function truncateLastLine(block: HTMLElement): boolean {
  const documentRoot = block.ownerDocument
  const walker = documentRoot.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let text = walker.nextNode()
  while (text) {
    nodes.push(text as Text)
    text = walker.nextNode()
  }
  const value = nodes.map((node) => node.data).join('')
  if (!value || nodes.length === 0) return false
  const starts: Array<{ node: Text; offset: number; block: number }> = []
  const vertical = getComputedStyle(block).writingMode.startsWith('vertical')
  const position = (offset: number): { node: Text; offset: number } => {
    let remaining = offset
    for (const node of nodes) {
      if (remaining <= node.data.length) return { node, offset: remaining }
      remaining -= node.data.length
    }
    const node = nodes[nodes.length - 1] as Text
    return { node, offset: node.data.length }
  }
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
    const start = position(segment.index)
    const end = position(segment.index + segment.segment.length)
    const range = documentRoot.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const rects = range.getClientRects()
    const rect = rects[rects.length - 1]
    if (rect) starts.push({ ...start, block: vertical ? rect.left : rect.top })
  }
  const cutIndex = lastLineStart(starts.map((start) => start.block))
  if (cutIndex <= 0) return false
  const cut = documentRoot.createRange()
  cut.selectNodeContents(block)
  const start = starts[cutIndex] as { node: Text; offset: number }
  cut.setStart(start.node, start.offset)
  cut.deleteContents()
  return true
}

export function applyRegionOverflow(
  region: HTMLElement,
  folio: string,
  refusalEnabled: boolean,
  excessOf: (element: HTMLElement) => { block: number } = inkExcess,
  truncateLine: (block: HTMLElement) => boolean = truncateLastLine,
): RegionOverflowOutcome {
  const mode = overflowMode(region)
  if (mode === 'grow') return { mode }
  let excess = excessOf(region).block
  if (excess <= 0.5) return { mode }
  const subject = regionSubject(region)
  if (mode === 'refuse') return { mode, ...(refusalEnabled ? { refusal: regionRefusal(subject, folio, excess) } : {}) }
  const dropped: string[] = []
  while (excess > 0.5 && region.lastElementChild) {
    const child = region.lastElementChild as HTMLElement
    const id = child.getAttribute('data-segnavia-id') ?? child.id ?? `${subject}:${dropped.length + 1}`
    if (!dropped.includes(id)) dropped.unshift(id)
    if (!truncateLine(child)) child.remove()
    excess = excessOf(region).block
  }
  return { mode, droppedIds: dropped }
}

export function reportRegionOverflow(
  region: HTMLElement,
  folio: string,
  outcome: RegionOverflowOutcome,
  entries: PreflightEntry[],
  facts: PreflightRegion[],
): void {
  if (outcome.mode !== 'truncate' || !outcome.droppedIds?.length) return
  recordTruncatedRegion(regionSubject(region), outcome.droppedIds, folio, entries, facts)
}

export function applyRegionOverflowTo(
  regions: ArrayLike<HTMLElement>,
  folioOf: (region: HTMLElement) => string,
  refusalEnabled: boolean,
  entries: PreflightEntry[],
  facts: PreflightRegion[],
  reporting: boolean,
): void {
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index] as HTMLElement
    const folio = folioOf(region)
    const outcome = applyRegionOverflow(region, folio, refusalEnabled)
    if (outcome.refusal) throw new Error(outcome.refusal)
    if (reporting) reportRegionOverflow(region, folio, outcome, entries, facts)
  }
}

export function embeddedComposerFillFunctions(): string {
  return `var FILL_MIN_DEFAULT=${FILL_MIN_DEFAULT},FILL_MAX_DEFAULT=${FILL_MAX_DEFAULT},PREFLIGHT_REGION_FIELD_LIMIT=${PREFLIGHT_REGION_FIELD_LIMIT},PREFLIGHT_DROPPED_IDS_LIMIT=${PREFLIGHT_DROPPED_IDS_LIMIT};
${embedFunction('runFillStageOnce', runFillStageOnce)}
${embedFunction('fillLimits', fillLimits)}
${embedFunction('lastLineStart', lastLineStart)}
${embedFunction('mergeRegionFact', mergeRegionFact)}
${embedFunction('overflowMode', overflowMode)}
${embedFunction('regionRefusal', regionRefusal)}
${embedFunction('truncatedRegion', truncatedRegion)}
${embedFunction('recordTruncatedRegion', recordTruncatedRegion)}
${embedFunction('regionSubject', regionSubject)}
${embedFunction('fillBlockExtent', fillBlockExtent)}
${embedFunction('repeatFill', repeatFill)}
${embedFunction('fillTemplateHolder', fillTemplateHolder)}
${embedFunction('fillTemplateSourceRegions', fillTemplateSourceRegions)}
${embedFunction('truncateLastLine', truncateLastLine)}
${embedFunction('applyRegionOverflow', applyRegionOverflow)}
${embedFunction('reportRegionOverflow', reportRegionOverflow)}
${embedFunction('applyRegionOverflowTo', applyRegionOverflowTo)}
var fillStageState={done:false,results:[]};
var fillSourceRegions=function(){return runFillStageOnce(fillStageState,function(){preflightRegions=fillTemplateSourceRegions(document,geometryFor,config.direction,config.lang);return preflightRegions;});};`
}
