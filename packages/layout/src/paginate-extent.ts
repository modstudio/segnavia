import type { PaginateLine, PaginateUnit } from './paginate-types.ts'

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

export function unitExtent(unit: PaginateUnit): PaginateExtent {
  return lineExtent(unit)
}
