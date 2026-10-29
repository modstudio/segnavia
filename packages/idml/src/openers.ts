import { findActiveContent, sanitize } from '@segnavia/html'
import type { IdmlModel } from './model.ts'
import { refusal } from './refusal.ts'
import type { ReportCollector } from './report.ts'
import type { StoryHtmlResult } from './stories.ts'
import { artSvg } from './svg-path.ts'
import type { IdmlAssetMap, IdmlBounds, IdmlMargin, IdmlPage, IdmlStory } from './types.ts'

interface MappedStory {
  story: IdmlStory
  mapped: StoryHtmlResult
}

const number = (value: number): string => String(Object.is(Number(value.toFixed(2)), -0) ? 0 : Number(value.toFixed(2)))

function firstPages(model: IdmlModel): Map<string, IdmlPage> {
  const result = new Map<string, IdmlPage>()
  for (const spread of model.spreads) for (const page of spread.pages) for (const story of page.stories) if (!result.has(story)) result.set(story, page)
  return result
}

function storyFramePages(model: IdmlModel): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const frame of page.bodyFrames ?? []) {
        const pages = result.get(frame.story) ?? new Set<string>()
        pages.add(page.id)
        result.set(frame.story, pages)
      }
    }
  }
  return result
}

function pageMargin(model: IdmlModel, page: IdmlPage): IdmlMargin {
  const master = model.masterSpreads.find((candidate) => candidate.id === page.appliedMaster)
  const matched = master?.pages.find((candidate) => candidate.side === page.side) ?? master?.pages[0]
  return matched?.margin ?? model.preferences.margin
}

function positionedStyle(bounds: IdmlBounds, top: number, model: IdmlModel, page: IdmlPage): string {
  const margin = pageMargin(model, page)
  const rtl = model.preferences.binding === 'right-to-left'
  const inline = rtl ? model.preferences.pageWidth - margin.right - bounds.right : bounds.left - margin.left
  return `position:absolute;inset-block-start:${number(bounds.top - top)}pt;inset-inline-start:${number(inline)}pt;inline-size:${number(bounds.right - bounds.left)}pt;block-size:${number(bounds.bottom - bounds.top)}pt`
}

function resolvedAsset(uri: string, asset: IdmlAssetMap | undefined, cache: Map<string, string | undefined>): string | undefined {
  if (cache.has(uri)) return cache.get(uri)
  const markup = asset?.(uri)
  const clean = markup === undefined ? undefined : sanitize(markup)
  if (clean !== undefined) {
    const active = findActiveContent(clean)
    if (active.length > 0)
      throw refusal(`the host asset mapping for ${JSON.stringify(uri)} contains active content (${active.join(', ')})`, 'return inactive SVG markup')
  }
  cache.set(uri, clean)
  return clean
}

function titleBlock(
  model: IdmlModel,
  page: IdmlPage,
  headers: MappedStory[],
  report: ReportCollector,
  asset: IdmlAssetMap | undefined,
  cache: Map<string, string | undefined>,
): string {
  const headerById = new Map(headers.map((entry) => [entry.story.id, entry.mapped.html]))
  const headerFrames = (page.bodyFrames ?? []).filter((frame) => headerById.has(frame.story))
  const itemBounds = [
    ...(page.art ?? []).map((item) => item.bounds),
    ...headerFrames.map((item) => item.bounds),
    ...(page.links ?? []).map((item) => item.bounds),
  ]
  if (itemBounds.length === 0) return ''
  const top = Math.min(...itemBounds.map((item) => item.top))
  const bottom = Math.max(...itemBounds.map((item) => item.bottom))
  const children: string[] = []
  for (const art of page.art ?? []) {
    for (const polygon of art.polygons) {
      const swatch = model.swatches?.find((candidate) => candidate.id === polygon.fill || candidate.name === polygon.fill)
      if (swatch?.model === 'spot') report.add(report.spotColors, swatch.name, polygon.location)
    }
    const svg = artSvg(art, model.swatches ?? [])
    for (const stroke of svg.unsupportedStrokes) report.add(report.unsupportedStyleProperties, stroke.name, stroke.location)
    children.push(svg.markup.replace('<svg ', `<svg style="${positionedStyle(art.bounds, top, model, page)}" `))
  }
  for (const frame of headerFrames) {
    children.push(`<div style="${positionedStyle(frame.bounds, top, model, page)}">${headerById.get(frame.story) ?? ''}</div>`)
  }
  for (const link of page.links ?? []) {
    const markup = resolvedAsset(link.uri, asset, cache) ?? ''
    children.push(`<div style="${positionedStyle(link.bounds, top, model, page)}">${markup}</div>`)
  }
  return `<div class="idml-title-block" style="position:relative;inline-size:100%;block-size:${number(bottom - top)}pt">${children.join('')}</div>`
}

export interface OpenerMapping {
  claimed: Set<string>
  html: Map<string, string>
}

function reportPageItems(model: IdmlModel, starts: Set<IdmlPage>, framePages: Map<string, Set<string>>, report: ReportCollector): void {
  for (const page of model.spreads.flatMap((spread) => spread.pages)) {
    for (const link of page.links ?? []) report.link(link.uri, link.location)
    for (const item of page.unmapped ?? []) report.add(report.unsupportedElements, item.name, item.location)
    if (starts.has(page)) continue
    for (const frame of page.bodyFrames ?? []) {
      if (framePages.get(frame.story)?.size === 1) report.add(report.unsupportedElements, 'header TextFrame', frame.location)
    }
  }
}

function claimHeaders(
  page: IdmlPage,
  story: string,
  claimed: Set<string>,
  framePages: Map<string, Set<string>>,
  byId: Map<string, MappedStory>,
): MappedStory[] {
  const headers: MappedStory[] = []
  for (const frame of page.bodyFrames ?? []) {
    if (frame.story === story || claimed.has(frame.story) || framePages.get(frame.story)?.size !== 1) continue
    const header = byId.get(frame.story)
    if (header && !headers.some((candidate) => candidate.story.id === header.story.id)) headers.push(header)
  }
  for (const header of headers) claimed.add(header.story.id)
  return headers
}

export function mapOpeners(model: IdmlModel, stories: MappedStory[], report: ReportCollector, asset?: IdmlAssetMap): OpenerMapping {
  const first = firstPages(model)
  const framePages = storyFramePages(model)
  const byId = new Map(stories.map((entry) => [entry.story.id, entry]))
  const claimed = new Set<string>()
  const html = new Map<string, string>()
  const cache = new Map<string, string | undefined>()
  reportPageItems(model, new Set(first.values()), framePages, report)
  const candidates = [...stories].sort((left, right) => {
    const score = (entry: MappedStory) => ((entry.story.frame?.columns ?? 0) >= 2 || (framePages.get(entry.story.id)?.size ?? 0) > 1 ? 1 : 0)
    return score(right) - score(left)
  })
  for (const entry of candidates) {
    if (claimed.has(entry.story.id)) continue
    const page = first.get(entry.story.id)
    if (!page) continue
    const headers = claimHeaders(page, entry.story.id, claimed, framePages, byId)
    const block = titleBlock(model, page, headers, report, asset, cache)
    html.set(entry.story.id, `${block}${entry.mapped.html}`)
  }
  return { claimed, html }
}
