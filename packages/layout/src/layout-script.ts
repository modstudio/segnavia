import {
  bookVariablePageNumbers,
  COMPOSER_CUSTOM_PROPERTY,
  COMPOSER_VALUES,
  divisionPrints,
  fingerprintScript,
  folioScript,
  HYPHENATE_CUSTOM_PROPERTY,
  LIBRARY_VARIABLES,
  metaVariableValue,
  STANDARD_META_FIELD_READERS,
  textVariableValue,
  variableValue,
  WORD_SPACING_CUSTOM_PROPERTY,
  WORD_SPACING_MAXIMUM,
  WORD_SPACING_PATTERN,
  withLibraryEntries,
} from '@segnavia/format'
import { bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
import { bookPlanFolios } from './book-plan-folios.ts'
import { convergeLayout } from './converge-layout.ts'
import { headTemplateScript } from './head-template.ts'
import { hyphenationScript } from './hyphenate.ts'
import { breakLinesScript } from './line-break.ts'
import { numberLinesScript } from './line-numbers.ts'
import { measurementsWithBreaks } from './measurement-breaks.ts'
import { paginateScript } from './paginate-book.ts'
import { numberVariableValue, pagesWithNumberVariables, planBookScript } from './plan-book.ts'
import { savedPlanScript } from './plan-save.ts'
import { planPrintedPages } from './printed-pages.ts'
import { placeSideNotesScript } from './side-notes.ts'

export function layoutScript(): string {
  return `${breakLinesScript()}
${hyphenationScript()}
var COMPOSER_CUSTOM_PROPERTY=${JSON.stringify(COMPOSER_CUSTOM_PROPERTY)};
var WORD_SPACING_CUSTOM_PROPERTY=${JSON.stringify(WORD_SPACING_CUSTOM_PROPERTY)};
var HYPHENATE_CUSTOM_PROPERTY=${JSON.stringify(HYPHENATE_CUSTOM_PROPERTY)};
var COMPOSER_VALUES=${JSON.stringify(COMPOSER_VALUES)};
var WORD_SPACING_PATTERN=${WORD_SPACING_PATTERN.toString()};var WORD_SPACING_MAXIMUM=${WORD_SPACING_MAXIMUM};
var readCompositionStyle=function(properties){var composerValue=properties.getPropertyValue(COMPOSER_CUSTOM_PROPERTY).trim();var spacingParts=properties.getPropertyValue(WORD_SPACING_CUSTOM_PROPERTY).trim().match(WORD_SPACING_PATTERN);var spacingValue;if(spacingParts){var minimum=Number(spacingParts[1]);var desired=Number(spacingParts[2]);var maximum=Number(spacingParts[3]);if(minimum<=desired&&desired<=maximum&&maximum<=WORD_SPACING_MAXIMUM)spacingValue={minimum:minimum,desired:desired,maximum:maximum};}var hyphenateValue=properties.getPropertyValue(HYPHENATE_CUSTOM_PROPERTY).trim();return Object.assign({},COMPOSER_VALUES.indexOf(composerValue)>=0?{composer:composerValue}:{},spacingValue?{wordSpacing:spacingValue}:{},hyphenateValue==='true'||hyphenateValue==='false'?{hyphenate:hyphenateValue==='true'}:{});};
${paginateScript()}
${numberLinesScript()}
${placeSideNotesScript()}
${headTemplateScript()}
${fingerprintScript()}
${savedPlanScript()}
${measurementsWithBreaks.toString()}
var measurementsWithBreaks=${measurementsWithBreaks.name};
${folioScript()}
${planPrintedPages.toString()}
var planPrintedPages=${planPrintedPages.name};
${divisionPrints.toString()}
${bookPlanFolios.toString()}
var bookPlanFolios=${bookPlanFolios.name};
${bookVariablePageNumbers.toString()}
${bookPlanDocumentNumbers.toString()}
var bookPlanDocumentNumbers=${bookPlanDocumentNumbers.name};
${textVariableValue.toString()}
var STANDARD_META_FIELD_READERS={${Object.entries(STANDARD_META_FIELD_READERS)
    .map(([field, reader]) => `${JSON.stringify(field)}:${reader.toString()}`)
    .join(',')}};
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
