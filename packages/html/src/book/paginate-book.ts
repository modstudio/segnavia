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
    return paginateColumns(placed).height + paginateNotes({ op: 'space', notes: input.notes, geometry: input.geometry, fragments })
  }

  function withNotes<T extends object>(extra: T) {
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

  function blockForNote(id: string): PaginateBlock | undefined {
    for (const flow of input.flows) {
      if (flow.kind === 'fixed') continue
      for (const candidate of flow.blocks) {
        if (candidate.footnoteRefs?.some((ref) => ref.note === id)) return candidate
      }
    }
  }

  function noteRefusal(id: string): PaginateBookRefusal {
    const clears = 'use a taller text area or a shorter note line to clear this refusal.'
    const found = blockForNote(id)
    if (!found) return { note: id, message: `Note ${id} could not establish a fit for a note line in the text area; ${clears}` }
    const where = `chapter ${found.position.chapter} block ${found.position.block}`
    return {
      tag: found.tag,
      position: found.position,
      message: `The ${found.tag} at ${where} could not establish a fit for a note line in the text area; ${clears}`,
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
      const allocated = paginateNotes(withNotes({ op: 'allocate' as const, placed, fragments: notes, unit }))
      if (!allocated) break
      placed.push(unit)
      notes = allocated
      next += 1
    }
    return { placed, fragments: notes, index: next }
  }

  function forcePlace(unit: PaginateUnit) {
    if (lineTooTall(unit)) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    const allocated = paginateNotes(withNotes({ op: 'allocate' as const, placed: [] as PaginateUnit[], fragments: [] as PaginatePageNote[], unit }))
    if (!allocated) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    return { placed: [unit], fragments: allocated, index: 0, pending: paginateNotes(withNotes({ op: 'leftover' as const, fragments: allocated })) }
  }

  function fillPage(units: PaginateUnit[], index: number, pending: PaginatePageNote[]) {
    const held = paginateNotes(withNotes({ op: 'continue' as const, pending }))
    const incoming = units[index]
    if (held.leftover.length === 0 && incoming && lineTooTall(incoming)) {
      return { placed: [], fragments: [], index, pending, refusal: refusal(incoming.block) }
    }
    const stuck = held.fragments.length === 0 ? held.leftover[0] : undefined
    if (stuck) return { placed: [], fragments: [], index, pending: held.leftover, refusal: noteRefusal(stuck.id) }
    if (held.leftover.length > 0) return { placed: [], fragments: held.fragments, index, pending: held.leftover }
    const filled = greedyFill([], held.fragments, units, index)
    const placed = paginateKeeps(filled.placed, units[filled.index], textHeight, orphans, widows, held.fragments.length > 0)
    const nextIndex = filled.index - (filled.placed.length - placed.length)
    const fragments = paginateNotes(withNotes({ op: 'recompute' as const, placed, seed: held.fragments }))
    if (placed.length > 0 || fragments.length > 0) {
      return { placed, fragments, index: nextIndex, pending: paginateNotes(withNotes({ op: 'leftover' as const, fragments })) }
    }
    const unit = units[nextIndex]
    const leftoverNote = pending[0]
    if (!unit && leftoverNote) return { placed: [], fragments: [], index: nextIndex, pending, refusal: noteRefusal(leftoverNote.id) }
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
  return `${PAGINATE_FUNCTIONS.map((fn) => fn.toString()).join('\n')}\nvar paginateBook=${paginateBook.name};`
}
