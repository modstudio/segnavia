import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { TextDirection } from './direction.ts'
import type { Plan } from './plan.ts'

export const DEFAULT_OUTLINE_DEPTH = 6
export const MAX_HEADING_LEVEL = 6
export const Outline = closedObject({ depth: z.number().int().min(1).max(MAX_HEADING_LEVEL).default(DEFAULT_OUTLINE_DEPTH) })
export const DefaultOutline = Outline.default({
  depth: DEFAULT_OUTLINE_DEPTH,
})
export type Outline = z.infer<typeof Outline>

export const HeadingListing = closedObject({ contents: z.boolean(), outline: z.boolean() })
export type HeadingListing = z.infer<typeof HeadingListing>
export const DEFAULT_HEADING_LISTING: HeadingListing = { contents: true, outline: true }

export const OutlineHeading = closedObject({
  id: z.string(),
  title: z.string(),
  level: z.number().int().min(1).max(6),
  listed: HeadingListing,
  block: z.string(),
})
export type OutlineHeading = z.infer<typeof OutlineHeading>

export const OutlineSource = closedObject({
  direction: TextDirection,
  depth: z.number().int().min(1).max(MAX_HEADING_LEVEL),
  headings: z.array(OutlineHeading),
  blocks: z.array(z.string()),
})
export type OutlineSource = z.infer<typeof OutlineSource>

export interface OutlineEntry {
  id: string
  title: string
  level: number
  depth: number
  page?: number
}

function headingPages(source: OutlineSource, plan?: Plan): Map<string, number> {
  if (!plan) return new Map()
  const blockOrder = new Map(source.blocks.map((id, index) => [id, index]))
  const starts = plan.pages.map((page, index) => {
    const block = page.start?.id
    const order = block === undefined ? undefined : blockOrder.get(block)
    return { order, page: index + 1 }
  })
  const pages = new Map<string, number>()
  for (const heading of source.headings) {
    const order = blockOrder.get(heading.block)
    if (order === undefined) continue
    let start: { order: number; page: number } | undefined
    for (const candidate of starts) {
      if (candidate.order === order) {
        start = { order, page: candidate.page }
        break
      }
      if (candidate.order === undefined) start = undefined
      else if (candidate.order < order) start = { order: candidate.order, page: candidate.page }
      else break
    }
    if (start) pages.set(heading.id, start.page)
  }
  return pages
}

export function documentOutline(source: OutlineSource, plan?: Plan): OutlineEntry[] {
  const pages = headingPages(source, plan)
  const entries: OutlineEntry[] = []
  const levels: number[] = []
  for (const heading of source.headings) {
    if (!heading.listed.outline) continue
    while ((levels.at(-1) ?? 0) >= heading.level) levels.pop()
    const depth = levels.length + 1
    if (depth > source.depth) continue
    entries.push({
      id: heading.id,
      title: heading.title,
      level: heading.level,
      depth,
      ...(pages.has(heading.id) ? { page: pages.get(heading.id) } : {}),
    })
    levels.push(heading.level)
  }
  return entries
}
