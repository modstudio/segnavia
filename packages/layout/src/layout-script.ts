import { fingerprintScript, folioScript } from '@segnavia/format'
import { bookPlanFolios } from './book-plan-folios.ts'
import { convergeLayout } from './converge-layout.ts'
import { measurementsWithBreaks } from './measurement-breaks.ts'
import { paginateScript } from './paginate-book.ts'
import { planBook } from './plan-book.ts'
import { savedPlanScript } from './plan-save.ts'
import { planPrintedPages } from './printed-pages.ts'

export function layoutScript(): string {
  return `${paginateScript()}
${fingerprintScript()}
${savedPlanScript()}
${measurementsWithBreaks.toString()}
var measurementsWithBreaks=${measurementsWithBreaks.name};
${folioScript()}
${planPrintedPages.toString()}
var planPrintedPages=${planPrintedPages.name};
${bookPlanFolios.toString()}
var bookPlanFolios=${bookPlanFolios.name};
${planBook.toString()}
var planBook=${planBook.name};
${convergeLayout.toString()}
var convergeLayout=${convergeLayout.name};`
}
