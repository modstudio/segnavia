import type { PaginatePageMarks, PaginateUnit } from './paginate-types.ts'

export function paginateMarks(placed: PaginateUnit[], carried: PaginatePageMarks): { marks: PaginatePageMarks; carried: PaginatePageMarks } {
  const onPage = Object.create(null) as PaginatePageMarks
  for (const unit of placed) {
    for (const mark of unit.block.marks ?? []) {
      if (mark.line !== unit.index) continue
      const current = onPage[mark.name]
      if (!current) onPage[mark.name] = { first: mark.value, last: mark.value }
      else current.last = mark.value
    }
  }
  const marks = Object.assign(Object.create(null), onPage) as PaginatePageMarks
  for (const name of Object.keys(carried)) {
    if (marks[name] !== undefined) continue
    const last = carried[name]?.last
    if (last === undefined) continue
    marks[name] = { first: last, last }
  }
  const next = Object.assign(Object.create(null), carried) as PaginatePageMarks
  for (const name of Object.keys(onPage)) {
    const value = onPage[name]
    if (value) next[name] = value
  }
  return { marks, carried: next }
}
