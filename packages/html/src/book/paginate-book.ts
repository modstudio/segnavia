import { paginateColumns } from './paginate-columns.ts'
import { paginateKeeps } from './paginate-keeps.ts'
import { paginateMarks } from './paginate-marks.ts'
import { paginateNotes } from './paginate-notes.ts'
import { paginateSequence } from './paginate-sequence.ts'
import type { PaginateBlock, PaginateBookInput, PaginateBookRefusal, PaginateBookResult, PaginatePageNote, PaginateUnit } from './paginate-types.ts'

export { paginateColumns } from './paginate-columns.ts'
export { paginateKeeps } from './paginate-keeps.ts'
export { paginateMarks } from './paginate-marks.ts'
export { paginateNotes } from './paginate-notes.ts'
export { paginateSequence } from './paginate-sequence.ts'

export function paginateBook(input: PaginateBookInput): PaginateBookResult {
  const textHeight = input.geometry.textHeight
  const orphans = input.settings.orphans ?? 2
  const widows = input.settings.widows ?? 2

  function used(placed: PaginateUnit[], fragments: PaginatePageNote[]): number {
    return paginateColumns(placed).height + paginateNotes('space', { notes: input.notes, geometry: input.geometry, fragments })
  }

  function payload(extra: {
    fragments?: PaginatePageNote[]
    pending?: PaginatePageNote[]
    placed?: PaginateUnit[]
    unit?: PaginateUnit
    seed?: PaginatePageNote[]
  }) {
    return { notes: input.notes, geometry: input.geometry, used, ...extra }
  }

  function refusal(block: PaginateBlock): PaginateBookRefusal {
    const position = `chapter ${block.position.chapter} block ${block.position.block}`
    return {
      tag: block.tag,
      position: block.position,
      message: `The ${block.tag} at ${position} could not establish a fit in the text area; shorten it or increase the text-area height to clear this refusal.`,
    }
  }

  function lineTooTall(unit: PaginateUnit): boolean {
    return unit.bottom - unit.top > textHeight
  }

  function greedyFill(placed: PaginateUnit[], fragments: PaginatePageNote[], units: PaginateUnit[], index: number) {
    let next = index
    let notes = fragments
    while (next < units.length) {
      const unit = units[next]
      if (!unit || lineTooTall(unit)) break
      const allocated = paginateNotes('allocate', payload({ placed, fragments: notes, unit }))
      if (!allocated) break
      placed.push(unit)
      notes = allocated
      next += 1
    }
    return { placed, fragments: notes, index: next }
  }

  function forcePlace(unit: PaginateUnit) {
    if (lineTooTall(unit)) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    const allocated = paginateNotes('allocate', payload({ placed: [], fragments: [], unit }))
    if (!allocated) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    return { placed: [unit], fragments: allocated, index: 0, pending: paginateNotes('leftover', payload({ fragments: allocated })) }
  }

  function fillPage(units: PaginateUnit[], index: number, pending: PaginatePageNote[]) {
    const held = paginateNotes('continue', payload({ pending }))
    const incoming = units[index]
    if (held.leftover.length === 0 && incoming && lineTooTall(incoming)) {
      return { placed: [], fragments: [], index, pending, refusal: refusal(incoming.block) }
    }
    if (held.leftover.length > 0) return { placed: [], fragments: held.fragments, index, pending: held.leftover }
    const filled = greedyFill([], held.fragments, units, index)
    const placed = paginateKeeps(filled.placed, units[filled.index], textHeight, orphans, widows)
    const nextIndex = filled.index - (filled.placed.length - placed.length)
    const fragments = paginateNotes('recompute', payload({ placed, seed: held.fragments }))
    if (placed.length > 0 || fragments.length > 0) {
      return { placed, fragments, index: nextIndex, pending: paginateNotes('leftover', payload({ fragments })) }
    }
    const unit = units[nextIndex]
    if (!unit) return { placed: [], fragments: [], index: nextIndex, pending, done: true }
    const forced = forcePlace(unit)
    if (forced.refusal) return forced
    return { placed: forced.placed, fragments: forced.fragments, index: nextIndex + 1, pending: forced.pending }
  }

  return paginateSequence(input, fillPage)
}

// Ordered for embedding: each function calls only the others by name.
export const PAGINATE_FUNCTIONS = [paginateColumns, paginateNotes, paginateKeeps, paginateMarks, paginateSequence, paginateBook]

export function paginateScript(): string {
  return PAGINATE_FUNCTIONS.map((fn) => fn.toString()).join('\n')
}
