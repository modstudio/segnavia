import { paginateColumns } from './paginate-columns.ts'
import { paginateKeeps } from './paginate-keeps.ts'
import { measuredExtentFits } from './paginate-measure.ts'
import { paginateNotes } from './paginate-notes.ts'
import { paginateSequence } from './paginate-sequence.ts'
import type { PaginateBlock, PaginateBookInput, PaginateBookRefusal, PaginateBookResult, PaginatePageNote, PaginateUnit } from './paginate-types.ts'
import { pageSetPoints, paginateVariables, resolveVariablesAcrossPages } from './paginate-variables.ts'
import {
  DESIGNED_PARENT_RULES,
  defaultParentRules,
  FLOWING_PARENT_RULES,
  finalParentSelections,
  finishedPaginateResult,
  finishedPlanParentResult,
  finishedPlanParents,
  initialParentSelection,
  selectParent,
  TEMPLATED_PARENT_RULES,
} from './parent-selection.ts'
import { pageFace } from './printed-pages.ts'

export { paginateColumns } from './paginate-columns.ts'
export { paginateKeeps } from './paginate-keeps.ts'
export { paginateNotes } from './paginate-notes.ts'
export { paginateSequence } from './paginate-sequence.ts'
export { paginateVariables, resolveVariablesAcrossPages } from './paginate-variables.ts'

function paginateBookWithPageFace(
  input: PaginateBookInput,
  faceOf: (index: number, direction: 'ltr' | 'rtl') => { face: 'recto' | 'verso'; side: 'left' | 'right' },
  paginate: typeof paginateSequence,
): PaginateBookResult {
  function variablesForPages(result: PaginateBookResult): PaginateBookResult {
    const declarations = input.variables.filter((variable) => variable.kind === 'text')
    const variables = resolveVariablesAcrossPages(
      result.pages,
      (page) => {
        const placed: PaginateUnit[] = []
        for (const window of page.windows) {
          const flow = input.flows.find((candidate) => candidate.id === window.flow)
          if (!flow || flow.kind === 'fixed') continue
          for (const block of flow.blocks) {
            block.lines.forEach((line, index) => {
              if (line.top >= window.start && line.bottom <= window.end) {
                placed.push({ flowId: flow.id, block, index, top: line.top, bottom: line.bottom, refs: [] })
              }
            })
          }
        }
        return placed
      },
      declarations,
    )
    return { ...result, pages: result.pages.map((page, index) => ({ ...page, variables: variables[index] ?? {} })) }
  }
  function used(textHeight: number, placed: PaginateUnit[], fragments: PaginatePageNote[]): number {
    return paginateColumns(placed).height + paginateNotes({ op: 'space', notes: input.notes, geometry: { ...input.geometry, textHeight }, fragments })
  }

  function withNotes<T extends object>(textHeight: number, extra: T) {
    return {
      notes: input.notes,
      geometry: { ...input.geometry, textHeight },
      used: (placed: PaginateUnit[], fragments: PaginatePageNote[]) => used(textHeight, placed, fragments),
      ...extra,
    }
  }

  function refusal(block: PaginateBlock, textArea = 'the text area'): PaginateBookRefusal {
    const position = `chapter ${block.position.chapter} block ${block.position.block}`
    return {
      tag: block.tag,
      position: block.position,
      message: `The ${block.tag} at ${position} could not establish a fit in ${textArea}; shorten it or increase the text-area height to clear this refusal.`,
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

  function lineTooTall(unit: PaginateUnit, textHeight: number): boolean {
    return !measuredExtentFits(unit.bottom - unit.top, textHeight)
  }

  function greedyFill(placed: PaginateUnit[], fragments: PaginatePageNote[], units: PaginateUnit[], index: number, textHeight: number) {
    let next = index
    let notes = fragments
    while (next < units.length) {
      const unit = units[next]
      if (!unit || lineTooTall(unit, textHeight)) break
      if (placed.length > 0 && unit.index === 0 && unit.block.breakBefore) break
      if (placed.at(-1)?.block.breakAfter && unit.index === 0) break
      const allocated = paginateNotes(withNotes(textHeight, { op: 'allocate' as const, placed, fragments: notes, unit }))
      if (!allocated) break
      placed.push(unit)
      notes = allocated
      next += 1
    }
    return { placed, fragments: notes, index: next }
  }

  function forcePlace(unit: PaginateUnit, textHeight: number, textArea?: string) {
    if (lineTooTall(unit, textHeight)) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block, textArea) }
    const allocated = paginateNotes(withNotes(textHeight, { op: 'allocate' as const, placed: [] as PaginateUnit[], fragments: [] as PaginatePageNote[], unit }))
    if (!allocated) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block, textArea) }
    return {
      placed: [unit],
      fragments: allocated,
      index: 0,
      pending: paginateNotes(withNotes(textHeight, { op: 'leftover' as const, fragments: allocated })),
    }
  }

  function fillPage(units: PaginateUnit[], index: number, pending: PaginatePageNote[], textHeight: number, textArea?: string) {
    const held = paginateNotes(withNotes(textHeight, { op: 'continue' as const, pending }))
    const incoming = units[index]
    if (held.leftover.length === 0 && incoming && lineTooTall(incoming, textHeight)) {
      return { placed: [], fragments: [], index, pending, refusal: refusal(incoming.block, textArea) }
    }
    const stuck = held.fragments.length === 0 ? held.leftover[0] : undefined
    if (stuck) return { placed: [], fragments: [], index, pending: held.leftover, refusal: noteRefusal(stuck.id) }
    if (held.leftover.length > 0) return { placed: [], fragments: held.fragments, index, pending: held.leftover }
    const filled = greedyFill([], held.fragments, units, index, textHeight)
    const placed = paginateKeeps(filled.placed, units[filled.index], textHeight, held.fragments.length > 0)
    const nextIndex = filled.index - (filled.placed.length - placed.length)
    const fragments = paginateNotes(withNotes(textHeight, { op: 'recompute' as const, placed, seed: held.fragments }))
    if (placed.length > 0 || fragments.length > 0) {
      return { placed, fragments, index: nextIndex, pending: paginateNotes(withNotes(textHeight, { op: 'leftover' as const, fragments })) }
    }
    const unit = units[nextIndex]
    const leftoverNote = pending[0]
    if (!unit && leftoverNote) return { placed: [], fragments: [], index: nextIndex, pending, refusal: noteRefusal(leftoverNote.id) }
    if (!unit) return { placed: [], fragments: [], index: nextIndex, pending, done: true }
    const forced = forcePlace(unit, textHeight, textArea)
    if (forced.refusal) return forced
    return { placed: forced.placed, fragments: forced.fragments, index: nextIndex + 1, pending: forced.pending }
  }

  return variablesForPages(paginate(input, fillPage, faceOf))
}

export function paginateBook(input: PaginateBookInput): PaginateBookResult {
  return paginateBookWithPageFace(input, pageFace, paginateSequence)
}

// Ordered for embedding: each function calls only the others by name.
export const PAGINATE_FUNCTIONS = [
  measuredExtentFits,
  paginateColumns,
  paginateNotes,
  paginateKeeps,
  pageSetPoints,
  paginateVariables,
  resolveVariablesAcrossPages,
  selectParent,
  initialParentSelection,
  finalParentSelections,
  finishedPlanParents,
  finishedPlanParentResult,
  finishedPaginateResult,
]

const EMBEDDED_PARENT_RULE_LISTS = [
  ['FLOWING_PARENT_RULES', FLOWING_PARENT_RULES],
  ['TEMPLATED_PARENT_RULES', TEMPLATED_PARENT_RULES],
  ['DESIGNED_PARENT_RULES', DESIGNED_PARENT_RULES],
] as const

export function paginateScript(): string {
  const defaultLists = EMBEDDED_PARENT_RULE_LISTS.map(([name, rules]) => `var ${name}=${JSON.stringify(rules)};`).join('')
  const embeddedDefaults =
    "function defaultParentRules(kind,role){if(kind==='fixed'&&role!=='body')return DESIGNED_PARENT_RULES;if(kind==='fixed')return TEMPLATED_PARENT_RULES;return FLOWING_PARENT_RULES;}"
  return `${defaultLists}${embeddedDefaults}var ${defaultParentRules.name}=defaultParentRules;\nvar pageFace=${pageFace.toString()};var ${pageFace.name}=pageFace;\n${PAGINATE_FUNCTIONS.map((fn) => fn.toString()).join('\n')}\nvar selectParent=${selectParent.name};var paginateSequence=${paginateSequence.toString()};var paginateBookWithPageFace=${paginateBookWithPageFace.toString()};var paginateBook=function(input){return paginateBookWithPageFace(input,pageFace,paginateSequence);};var ${paginateBook.name}=paginateBook;`
}
