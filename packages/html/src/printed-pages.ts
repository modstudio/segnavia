import { formatNumber, type NumberSystem, type PrintedPageRole, type PrintedPageRules } from '@segnavia/format'

export type PrintedPageSide = 'left' | 'right'

export interface PrintedPagePlan {
  index: number
  role: PrintedPageRole
  parent: string
  side: PrintedPageSide
  number: string
  total: string
}

export function printedPageAt(
  rules: PrintedPageRules,
  index: number,
  count: number,
  direction: 'ltr' | 'rtl',
): Pick<PrintedPagePlan, 'role' | 'parent' | 'side'> {
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
  return { role, parent, side }
}

export function planPrintedPages(rules: PrintedPageRules, count: number, direction: 'ltr' | 'rtl', numbering: NumberSystem = 'arabic'): PrintedPagePlan[] {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('A printed-page plan needs a positive safe page count.')
  const total = formatNumber(count, numbering)
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1
    return { index, ...printedPageAt(rules, index, count, direction), number: formatNumber(index, numbering), total }
  })
}
