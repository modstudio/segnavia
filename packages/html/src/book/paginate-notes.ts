import type { PaginateNote, PaginateNotesOp, PaginatePageNote, PaginateUnit } from './paginate-types.ts'

export function paginateNotes(payload: Extract<PaginateNotesOp, { op: 'space' }>): number
export function paginateNotes(payload: Extract<PaginateNotesOp, { op: 'continue' }>): { fragments: PaginatePageNote[]; leftover: PaginatePageNote[] }
export function paginateNotes(payload: Extract<PaginateNotesOp, { op: 'allocate' }>): PaginatePageNote[] | undefined
export function paginateNotes(payload: Extract<PaginateNotesOp, { op: 'recompute' }>): PaginatePageNote[]
export function paginateNotes(payload: Extract<PaginateNotesOp, { op: 'leftover' }>): PaginatePageNote[]
export function paginateNotes(
  payload: PaginateNotesOp,
): number | PaginatePageNote[] | { fragments: PaginatePageNote[]; leftover: PaginatePageNote[] } | undefined {
  const notesById = new Map(payload.notes.map((note: PaginateNote) => [note.id, note]))
  const notesGap = payload.geometry.notesGap
  const noteSeries = payload.geometry.noteSeries
  const textHeight = payload.geometry.textHeight
  const seriesOrder = new Map(noteSeries?.map((series, index) => [series.name, index]))
  const noteOrder = new Map(payload.notes.map((note, index) => [note.id, index]))

  function ordered(fragments: PaginatePageNote[]): PaginatePageNote[] {
    if (!noteSeries) return fragments
    return fragments.slice().sort((left, right) => {
      const leftSeries = seriesOrder.get(left.series) ?? noteSeries.length
      const rightSeries = seriesOrder.get(right.series) ?? noteSeries.length
      return leftSeries - rightSeries || (noteOrder.get(left.id) ?? 0) - (noteOrder.get(right.id) ?? 0)
    })
  }

  function noteEnd(id: string): number {
    return notesById.get(id)?.lines.length ?? 0
  }

  function fragmentHeight(fragment: PaginatePageNote): number {
    const note = notesById.get(fragment.id)
    const start = note?.lines[fragment.start]
    const end = note?.lines[fragment.end - 1]
    return start && end ? end.bottom - start.top : 0
  }

  function notesSpace(fragments: PaginatePageNote[]): number {
    if (fragments.length === 0) return 0
    if (!noteSeries) return notesGap + fragments.reduce((height, fragment) => height + fragmentHeight(fragment), 0)
    let height = 0
    let previous: string | undefined
    for (const fragment of ordered(fragments)) {
      if (fragment.series !== previous) height += noteSeries.find(({ name }) => name === fragment.series)?.gap ?? notesGap
      height += fragmentHeight(fragment)
      previous = fragment.series
    }
    return height
  }

  function measure(placed: PaginateUnit[], fragments: PaginatePageNote[]): number {
    if (payload.op === 'continue' || payload.op === 'allocate' || payload.op === 'recompute') {
      return payload.used(placed, fragments)
    }
    return notesSpace(fragments)
  }

  function makeFragment(id: string, start: number, end: number): PaginatePageNote {
    return { id, series: notesById.get(id)?.series ?? '', whole: start === 0 && end === noteEnd(id), start, end }
  }

  function leftoverFrom(fragments: PaginatePageNote[]): PaginatePageNote[] {
    return ordered(
      fragments.flatMap((fragment) => (fragment.end < noteEnd(fragment.id) ? [makeFragment(fragment.id, fragment.end, noteEnd(fragment.id))] : [])),
    )
  }

  function takeContinued(continued: PaginatePageNote[]): { fragments: PaginatePageNote[]; leftover: PaginatePageNote[] } {
    if (continued.length === 0) return { fragments: [], leftover: [] }
    const fragments: PaginatePageNote[] = []
    const leftover: PaginatePageNote[] = []
    let pending = true
    for (const item of ordered(continued)) {
      const total = noteEnd(item.id)
      if (!pending) {
        leftover.push(item)
        continue
      }
      const whole = makeFragment(item.id, item.start, total)
      if (measure([], [...fragments, whole]) <= textHeight) {
        fragments.push(whole)
        continue
      }
      let end = item.start
      while (end < total && measure([], [...fragments, makeFragment(item.id, item.start, end + 1)]) <= textHeight) end += 1
      if (end > item.start) fragments.push(makeFragment(item.id, item.start, end))
      if (end < total) leftover.push(makeFragment(item.id, end, total))
      pending = false
    }
    return { fragments: ordered(fragments), leftover: ordered(leftover) }
  }

  function fitNote(trial: PaginateUnit[], fragments: PaginatePageNote[], id: string): PaginatePageNote | undefined {
    const total = noteEnd(id)
    if (total === 0) return undefined
    const whole = makeFragment(id, 0, total)
    if (measure(trial, [...fragments, whole]) <= textHeight) return whole
    const minimum = Math.min(2, total)
    if (measure(trial, [...fragments, makeFragment(id, 0, minimum)]) > textHeight) return undefined
    let end = minimum
    while (end < total && measure(trial, [...fragments, makeFragment(id, 0, end + 1)]) <= textHeight) end += 1
    return makeFragment(id, 0, end)
  }

  function allocateNotes(placed: PaginateUnit[], existing: PaginatePageNote[], unit: PaginateUnit): PaginatePageNote[] | undefined {
    const trial = [...placed, unit]
    if (measure(trial, existing) > textHeight) return undefined
    const fragments = existing.slice()
    for (const id of unit.refs) {
      if (fragments.some((fragment) => fragment.id === id)) continue
      const fragment = fitNote(trial, fragments, id)
      if (!fragment) return undefined
      fragments.push(fragment)
    }
    return ordered(fragments)
  }

  function notesFor(placed: PaginateUnit[], seed: PaginatePageNote[]): PaginatePageNote[] {
    let fragments = seed
    for (const [offset, unit] of placed.entries()) {
      const allocated = allocateNotes(placed.slice(0, offset), fragments, unit)
      if (!allocated) break
      fragments = allocated
    }
    return fragments
  }

  if (payload.op === 'space') return notesSpace(payload.fragments)
  if (payload.op === 'continue') return takeContinued(payload.pending)
  if (payload.op === 'allocate') return allocateNotes(payload.placed, payload.fragments, payload.unit)
  if (payload.op === 'recompute') return notesFor(payload.placed, payload.seed)
  return leftoverFrom(payload.fragments)
}
