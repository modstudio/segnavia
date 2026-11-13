import { embedFunction } from '@segnavia/html'
import {
  appendMarginOverset,
  appendMarginOversetEntry,
  appendMissingSideNote,
  appendSideNoteOverset,
  claimSideNotes,
  createLineNumber,
  crossedLimit,
  crossedPageOrFurniture,
  drawLineNumbers,
  drawMarginContent,
  drawPageLineNumbers,
  drawPageSideNotes,
  drawSideNotes,
  intersects,
  lineNumberEdge,
  physicalColumn,
  prepareSideNote,
  sideNoteCrossing,
  stackPageSideNotes,
  widestLineNumber,
} from './composer-margin.ts'

export function embeddedComposerMarginFunctions(): string {
  return (
    `var MARGIN_LINE_NUMBER_SELECTOR='[data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-line-number]';\n${embedFunction('intersects', intersects)}\n${embedFunction('physicalColumn', physicalColumn)}\n${embedFunction('lineNumberEdge', lineNumberEdge)}\n${embedFunction('createLineNumber', createLineNumber)}\n${embedFunction('crossedPageOrFurniture', crossedPageOrFurniture)}\n${embedFunction('crossedLimit', crossedLimit)}\n${embedFunction('appendMarginOversetEntry', appendMarginOversetEntry)}\n${embedFunction('appendMarginOverset', appendMarginOverset)}\n${embedFunction('drawPageLineNumbers', drawPageLineNumbers)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}` +
    `\n${embedFunction('appendSideNoteOverset', appendSideNoteOverset)}\n${embedFunction('appendMissingSideNote', appendMissingSideNote)}\n${embedFunction('widestLineNumber', widestLineNumber)}\n${embedFunction('drawPageSideNotes', drawPageSideNotes)}\n${embedFunction('claimSideNotes', claimSideNotes)}\n${embedFunction('drawSideNotes', drawSideNotes)}\n${embedFunction('drawMarginContent', drawMarginContent)}` +
    `\n${embedFunction('prepareSideNote', prepareSideNote)}\n${embedFunction('sideNoteCrossing', sideNoteCrossing)}\n${embedFunction('stackPageSideNotes', stackPageSideNotes)}`
  )
}
