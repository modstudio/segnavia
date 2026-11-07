import { folioScript } from '@segnavia/format'
import { bookPlanFolios } from './book-plan-folios.ts'
import { convergeLayout } from './converge-layout.ts'
import { paginateScript } from './paginate-book.ts'
import { planBook } from './plan-book.ts'
import { planPrintedPages } from './printed-pages.ts'

export function layoutScript(): string {
  return `${paginateScript()}
${folioScript()}
${planPrintedPages.toString()}
${bookPlanFolios.toString()}
${planBook.toString()}
${convergeLayout.toString()}`
}
