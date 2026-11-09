import type { NumberSystem, PageSide, ParentRules, TextDirection } from '@segnavia/format'
import { sequenceFolios } from '@segnavia/format'
import { defaultParentRules, selectParent } from './parent-selection.ts'

export type PrintedPageSide = 'left' | 'right'
export interface PrintedPagePlan {
  index: number
  parent: string
  face: PageSide
  side: PrintedPageSide
  number: string
  total: string
}

export type BookPrintedPageRole = 'recto' | 'verso' | 'opener' | 'blank' | 'fixed'

export interface BookPageFacts {
  blank: boolean
  sectionOpening: boolean
  sectionLast?: boolean
  folio?: string
  runningHead?: string
  role?: BookPrintedPageRole | 'body'
  parentRules?: ParentRules
  variables?: Record<string, string>
  recordSlots?: Record<string, string>
}

export interface BookPrintedPagePlan extends Omit<BookPageFacts, 'blank' | 'sectionOpening' | 'parentRules'> {
  index: number
  role: BookPrintedPageRole
  parent: string
  face: PageSide
  side: PrintedPageSide
}

export function pageFace(index: number, direction: TextDirection): { face: PageSide; side: PrintedPageSide } {
  const recto = index % 2 === 1
  return { face: recto ? 'recto' : 'verso', side: recto === (direction === 'ltr') ? 'right' : 'left' }
}

export function planPrintedPages(rules: ParentRules, count: number, direction: TextDirection, numbering: NumberSystem = 'arabic'): PrintedPagePlan[] {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('A printed-page plan needs a positive safe page count.')
  const folios = sequenceFolios(count, numbering)
  const last = folios.at(-1)
  if (!last) throw new RangeError('A printed-page plan needs at least one computed folio.')
  return folios.map((folio, offset) => {
    const index = offset + 1
    const physical = pageFace(index, direction)
    const parent = selectParent(rules, {
      documentFirst: index === 1,
      documentLast: index === count,
      sectionFirst: index === 1,
      sectionLast: index === count,
      face: physical.face,
      blank: false,
    })
    return { index, parent, ...physical, number: folio.text, total: last.text }
  })
}

function bookPageRules(fact: BookPageFacts): ParentRules {
  if (fact.parentRules) return fact.parentRules
  if (fact.role === 'body') return defaultParentRules('fixed', 'body')
  if (fact.role === 'fixed') return defaultParentRules('fixed', 'fixed')
  return defaultParentRules('flowing')
}

export function planBookPages(facts: BookPageFacts[], direction: TextDirection): BookPrintedPagePlan[] {
  return facts.map((fact, offset) => {
    const index = offset + 1
    const physical = pageFace(index, direction)
    const role: BookPrintedPageRole = fact.blank
      ? 'blank'
      : fact.role === 'fixed'
        ? 'fixed'
        : fact.sectionOpening && fact.role !== 'body'
          ? 'opener'
          : physical.face
    const parent = selectParent(bookPageRules(fact), {
      documentFirst: index === 1,
      documentLast: index === facts.length,
      sectionFirst: fact.sectionOpening,
      sectionLast: fact.sectionLast ?? false,
      face: physical.face,
      blank: fact.blank,
    })
    return {
      index,
      role,
      parent,
      ...physical,
      ...(fact.folio === undefined || role === 'blank' ? {} : { folio: fact.folio }),
      ...(fact.runningHead === undefined || role === 'blank' || role === 'opener' ? {} : { runningHead: fact.runningHead }),
      variables: fact.variables ?? {},
      recordSlots: fact.recordSlots ?? {},
    }
  })
}
