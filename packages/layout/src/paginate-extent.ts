import type { PaginateLine } from './paginate-types.ts'

export interface PaginateExtent {
  start: number
  end: number
}

export function lineExtent(line: PaginateLine): PaginateExtent {
  return {
    start: Math.min(line.top, line.decorationTop ?? line.top),
    end: Math.max(line.bottom, line.decorationBottom ?? line.bottom),
  }
}

export function internalWindowEdge(previous: PaginateLine, next: PaginateLine): number {
  const previousEnd = lineExtent(previous).end
  const nextStart = lineExtent(next).start
  const preferred = Math.min((previousEnd + nextStart) / 2, nextStart)
  return Math.max(previous.bottom, Math.min(preferred, next.top))
}
