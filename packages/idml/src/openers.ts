import { findActiveContent, sanitize } from '@segnavia/html'
import type { MasterMapping } from './masters.ts'
import type { IdmlModel } from './model.ts'
import { formatRoundedNumber, positionedBoxStyle } from './positioned-box.ts'
import type { ReportCollector } from './report.ts'
import type { StoryHtmlResult } from './stories.ts'
import { artSvg } from './svg-path.ts'
import type { IdmlAssetMap, IdmlBounds, IdmlFramePlacement, IdmlPage, IdmlStory, IdmlTextNode } from './types.ts'

export interface MappedStory {
  story: IdmlStory
  mapped: StoryHtmlResult
}

interface PageUse {
  page: IdmlPage
  ordinal: number
}

interface PositionedHeader {
  frame: IdmlFramePlacement
  html: string
}

function firstPages(model: IdmlModel): Map<string, PageUse> {
  const result = new Map<string, PageUse>()
  let ordinal = 0
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const story of page.stories) if (!result.has(story)) result.set(story, { page, ordinal })
      ordinal += 1
    }
  }
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

function textLength(node: IdmlTextNode | undefined): number {
  if (!node) return 0
  return (node.text?.length ?? 0) + node.children.reduce((total, child) => total + textLength(child), 0)
}

function frameRank(page: IdmlPage, story: string): { area: number; top: number } {
  return (page.bodyFrames ?? [])
    .filter((frame) => frame.story === story)
    .reduce(
      (best, frame) => {
        const area = (frame.bounds.right - frame.bounds.left) * (frame.bounds.bottom - frame.bounds.top)
        return area > best.area || (area === best.area && frame.bounds.top > best.top) ? { area, top: frame.bounds.top } : best
      },
      { area: 0, top: Number.NEGATIVE_INFINITY },
    )
}

function selectedFlows(stories: MappedStory[], first: Map<string, PageUse>, framePages: Map<string, Set<string>>): Map<IdmlPage, MappedStory> {
  const candidates = new Map<IdmlPage, MappedStory[]>()
  for (const entry of stories) {
    const page = first.get(entry.story.id)?.page
    if (page) candidates.set(page, [...(candidates.get(page) ?? []), entry])
  }
  const selected = new Map<IdmlPage, MappedStory>()
  for (const [page, entries] of candidates) {
    entries.sort((left, right) => {
      const preferred = (entry: MappedStory) => (framePages.get(entry.story.id)?.size ?? 0) > 1 || (entry.story.frame?.columns ?? 0) >= 2
      const preference = Number(preferred(right)) - Number(preferred(left))
      if (preference !== 0) return preference
      const leftFrame = frameRank(page, left.story.id)
      const rightFrame = frameRank(page, right.story.id)
      return rightFrame.area - leftFrame.area || rightFrame.top - leftFrame.top
    })
    const winner = entries[0]
    if (winner) selected.set(page, winner)
  }
  return selected
}

function resolvedAsset(uri: string, asset: IdmlAssetMap | undefined, cache: Map<string, string | undefined>, report: ReportCollector): string | undefined {
  if (cache.has(uri)) return cache.get(uri)
  const markup = asset?.(uri)
  if (markup !== undefined) for (const finding of findActiveContent(markup)) report.strippedAsset(uri, finding)
  const clean = markup === undefined ? undefined : sanitize(markup)
  cache.set(uri, clean)
  return clean
}

function titleBlock(
  model: IdmlModel,
  use: PageUse,
  headers: PositionedHeader[],
  masters: MasterMapping,
  report: ReportCollector,
  asset: IdmlAssetMap | undefined,
  cache: Map<string, string | undefined>,
): string {
  const page = use.page
  const itemBounds = [
    ...(page.art ?? []).map((item) => item.bounds),
    ...headers.map((item) => item.frame.bounds),
    ...(page.links ?? []).map((item) => item.bounds),
  ]
  if (itemBounds.length === 0) return ''
  const top = Math.min(...itemBounds.map((item) => item.top))
  const bottom = Math.max(...itemBounds.map((item) => item.bottom))
  const style = (bounds: IdmlBounds) =>
    positionedBoxStyle(bounds, {
      pageWidth: model.preferences.pageWidth,
      margin: masters.marginFor(page, use.ordinal),
      rtl: model.preferences.binding === 'right-to-left',
      blockOrigin: top,
      unit: 'pt',
    })
  const children: string[] = []
  for (const art of page.art ?? []) children.push(artSvg(art, model.swatches ?? [], style(art.bounds), report))
  for (const header of headers) children.push(`<div style="${style(header.frame.bounds)}">${header.html}</div>`)
  for (const link of page.links ?? []) {
    const markup = resolvedAsset(link.uri, asset, cache, report) ?? ''
    children.push(`<div style="${style(link.bounds)}">${markup}</div>`)
  }
  return `<div class="idml-title-block" style="position:relative;inline-size:100%;block-size:${formatRoundedNumber(bottom - top)}pt">${children.join('')}</div>`
}

export interface OpenerMapping {
  claimed: Set<string>
  html: Map<string, string>
  consumedPages: Set<IdmlPage>
}

function claimHeaders(
  page: IdmlPage,
  flow: MappedStory,
  claimed: Set<string>,
  framePages: Map<string, Set<string>>,
  byId: Map<string, MappedStory>,
): PositionedHeader[] {
  const headers: PositionedHeader[] = []
  const flowLength = textLength(flow.story.root)
  for (const frame of page.bodyFrames ?? []) {
    if (frame.story === flow.story.id || claimed.has(frame.story) || framePages.get(frame.story)?.size !== 1) continue
    const header = byId.get(frame.story)
    if (!header || textLength(header.story.root) > flowLength || headers.some((candidate) => candidate.frame.story === frame.story)) continue
    claimed.add(header.story.id)
    headers.push({ frame, html: header.mapped.html })
  }
  return headers
}

export function mapOpeners(model: IdmlModel, stories: MappedStory[], masters: MasterMapping, report: ReportCollector, asset?: IdmlAssetMap): OpenerMapping {
  const first = firstPages(model)
  const framePages = storyFramePages(model)
  const byId = new Map(stories.map((entry) => [entry.story.id, entry]))
  const claimed = new Set<string>()
  const html = new Map<string, string>()
  const consumedPages = new Set<IdmlPage>()
  const cache = new Map<string, string | undefined>()
  for (const [page, flow] of selectedFlows(stories, first, framePages)) {
    const use = first.get(flow.story.id)
    if (!use) continue
    const headers = claimHeaders(page, flow, claimed, framePages, byId)
    const block = titleBlock(model, use, headers, masters, report, asset, cache)
    if (block) consumedPages.add(page)
    html.set(flow.story.id, `${block}${flow.mapped.html}`)
  }
  return { claimed, html, consumedPages }
}
