import {
  bookVariablePageNumbers,
  dateVariableValue,
  fingerprintScript,
  folioScript,
  LIBRARY_VARIABLES,
  metaVariableValue,
  textVariableValue,
  variableValue,
  withLibraryEntries,
} from '@segnavia/format'
import { bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { bookPlanFolios } from './book-plan-folios.ts'
import { convergeLayout } from './converge-layout.ts'
import { headTemplateScript } from './head-template.ts'
import { measurementsWithBreaks } from './measurement-breaks.ts'
import { paginateScript } from './paginate-book.ts'
import { numberVariableValue, pagesWithNumberVariables, planBookScript } from './plan-book.ts'
import { savedPlanScript } from './plan-save.ts'
import { planPrintedPages } from './printed-pages.ts'

export function layoutScript(): string {
  return `${paginateScript()}
${headTemplateScript()}
${fingerprintScript()}
${savedPlanScript()}
${measurementsWithBreaks.toString()}
var measurementsWithBreaks=${measurementsWithBreaks.name};
${folioScript()}
${planPrintedPages.toString()}
var planPrintedPages=${planPrintedPages.name};
${bookPlanFolios.toString()}
var bookPlanFolios=${bookPlanFolios.name};
${bookVariablePageNumbers.toString()}
${bookPlanDocumentNumbers.toString()}
var bookPlanDocumentNumbers=${bookPlanDocumentNumbers.name};
${textVariableValue.toString()}
${dateVariableValue.toString()}
${metaVariableValue.toString()}
${variableValue.toString()}
${withLibraryEntries.toString()}
var withLibraryEntries=${withLibraryEntries.name};
var LIBRARY_VARIABLES=${JSON.stringify(LIBRARY_VARIABLES)};
${numberVariableValue.toString()}
${pagesWithNumberVariables.toString()}
${planBookScript()}
${convergeLayout.toString()}
var convergeLayout=${convergeLayout.name};`
}
