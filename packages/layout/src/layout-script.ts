import { folioScript } from '@segnavia/format'
import { bookPlanFolios } from './book-plan-folios.ts'
import { convergeLayout } from './converge-layout.ts'
import { paginateScript } from './paginate-book.ts'
import { planBook } from './plan-book.ts'

export function layoutScript(): string {
  return `${paginateScript()}
${folioScript()}
${bookPlanFolios.toString()}
${planBook.toString()}
${convergeLayout.toString()}`
}
