import { formatNumber, type NumberSystem, type PrintedPageRules, resolveDirection } from '@segnavia/format'

export type PrintedPageRole = 'first' | 'last' | 'recto' | 'verso' | 'every'
export type PrintedPageSide = 'left' | 'right'

export interface PrintedPagePlan {
  index: number
  role: PrintedPageRole
  parent: string
  side: PrintedPageSide
  number: string
  total: string
}

export function defaultPageNumbering(lang: string | undefined): NumberSystem {
  return resolveDirection(undefined, lang, '') === 'rtl' && lang?.toLowerCase().split('-')[0] === 'he' ? 'hebrew' : 'arabic'
}

export function planPrintedPages(rules: PrintedPageRules, count: number, direction: 'ltr' | 'rtl', numbering: NumberSystem = 'arabic'): PrintedPagePlan[] {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('A printed-page plan needs a positive safe page count.')
  const total = formatNumber(count, numbering)
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1
    const recto = index % 2 === 1
    const side: PrintedPageSide = recto === (direction === 'ltr') ? 'right' : 'left'
    let role: PrintedPageRole = 'every'
    let parent = rules.every
    if (recto && rules.recto) {
      role = 'recto'
      parent = rules.recto
    } else if (!recto && rules.verso) {
      role = 'verso'
      parent = rules.verso
    }
    if (index === count && rules.last) {
      role = 'last'
      parent = rules.last
    }
    if (index === 1 && rules.first) {
      role = 'first'
      parent = rules.first
    }
    return { index, role, parent, side, number: formatNumber(index, numbering), total }
  })
}
