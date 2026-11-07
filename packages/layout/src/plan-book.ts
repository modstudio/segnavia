import type { NumberSystem } from '@segnavia/format'
import { bookPlanFolios } from './book-plan-folios.ts'
import { paginateBook } from './paginate-book.ts'
import type { PaginateBookInput, PaginateBookPage, PaginateBookRefusal } from './paginate-types.ts'

export type Measurements = PaginateBookInput

export interface Plan {
  pages: PaginateBookPage[]
  folios: string[]
  total: string
}

export interface PlanBookNumbering {
  frontMatter: NumberSystem
  body: NumberSystem
}

export function planBook(measurements: Measurements, numbering: PlanBookNumbering): { ok: true; plan: Plan } | { ok: false; refusals: PaginateBookRefusal[] } {
  const paginated = paginateBook(measurements)
  if (paginated.refusals.length > 0) return { ok: false, refusals: paginated.refusals }
  const numbered = bookPlanFolios(paginated.pages, numbering)
  return { ok: true, plan: { pages: paginated.pages, ...numbered } }
}
