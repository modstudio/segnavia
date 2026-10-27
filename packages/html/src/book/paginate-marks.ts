import type { PaginatePageMarks, PaginateUnit } from './paginate-types.ts'

export function paginateMarks(placed: PaginateUnit[], carried: PaginatePageMarks): { marks: PaginatePageMarks; carried: PaginatePageMarks } {
  function record(): PaginatePageMarks {
    return Object.create(null) as PaginatePageMarks
  }

  function copyInto(target: PaginatePageMarks, source: PaginatePageMarks): void {
    for (const name of Object.keys(source)) {
      if (!Object.hasOwn(source, name)) continue
      const value = source[name]
      if (value) target[name] = value
    }
  }

  const onPage = record()
  for (const unit of placed) {
    for (const mark of unit.block.marks ?? []) {
      if (mark.line !== unit.index) continue
      if (Object.hasOwn(onPage, mark.name)) {
        const current = onPage[mark.name]
        if (current) current.last = mark.value
      } else onPage[mark.name] = { first: mark.value, last: mark.value }
    }
  }
  const marks = record()
  copyInto(marks, onPage)
  for (const name of Object.keys(carried)) {
    if (!Object.hasOwn(carried, name) || Object.hasOwn(marks, name)) continue
    const last = carried[name]?.last
    if (last === undefined) continue
    marks[name] = { first: last, last }
  }
  const next = record()
  copyInto(next, carried)
  copyInto(next, onPage)
  return { marks, carried: next }
}
