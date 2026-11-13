import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import type { TextDirection } from './direction.ts'
import type { Plan } from './plan.ts'

export const Outline = closedObject({ depth: z.number().int().min(1).max(6).default(6) })
export type Outline = z.infer<typeof Outline>

export const HeadingListing = closedObject({ contents: z.boolean(), outline: z.boolean() })
export type HeadingListing = z.infer<typeof HeadingListing>

export const OutlineHeading = closedObject({
  id: z.string(),
  title: z.string(),
  level: z.number().int().min(1).max(6),
  listed: HeadingListing,
  block: z.string(),
})
export type OutlineHeading = z.infer<typeof OutlineHeading>

export interface OutlineSource {
  direction: z.infer<typeof TextDirection>
  depth: number
  headings: readonly OutlineHeading[]
  blocks: readonly string[]
}

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
  const starts = plan.pages.flatMap((page, index) => {
    const block = page.start?.id
    const order = block === undefined ? undefined : blockOrder.get(block)
    return order === undefined ? [] : [{ order, page: index + 1 }]
  })
  const pages = new Map<string, number>()
  for (const heading of source.headings) {
    const order = blockOrder.get(heading.block)
    if (order === undefined) continue
    let start: (typeof starts)[number] | undefined
    for (const candidate of starts) if (candidate.order <= order) start = candidate
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
