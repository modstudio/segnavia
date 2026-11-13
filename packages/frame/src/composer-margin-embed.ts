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
  lineNumberInnerEdge,
  marginLineNumberSelector,
  physicalColumn,
  prepareSideNote,
  sideNoteCrossing,
  stackPageSideNotes,
} from './composer-margin.ts'

export function embeddedComposerMarginFunctions(): string {
  return (
    `${embedFunction('marginLineNumberSelector', marginLineNumberSelector)}\n${embedFunction('intersects', intersects)}\n${embedFunction('physicalColumn', physicalColumn)}\n${embedFunction('lineNumberEdge', lineNumberEdge)}\n${embedFunction('createLineNumber', createLineNumber)}\n${embedFunction('crossedPageOrFurniture', crossedPageOrFurniture)}\n${embedFunction('crossedLimit', crossedLimit)}\n${embedFunction('appendMarginOversetEntry', appendMarginOversetEntry)}\n${embedFunction('appendMarginOverset', appendMarginOverset)}\n${embedFunction('drawPageLineNumbers', drawPageLineNumbers)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}` +
    `\n${embedFunction('appendSideNoteOverset', appendSideNoteOverset)}\n${embedFunction('appendMissingSideNote', appendMissingSideNote)}\n${embedFunction('lineNumberInnerEdge', lineNumberInnerEdge)}\n${embedFunction('drawPageSideNotes', drawPageSideNotes)}\n${embedFunction('claimSideNotes', claimSideNotes)}\n${embedFunction('drawSideNotes', drawSideNotes)}\n${embedFunction('drawMarginContent', drawMarginContent)}` +
    `\n${embedFunction('prepareSideNote', prepareSideNote)}\n${embedFunction('sideNoteCrossing', sideNoteCrossing)}\n${embedFunction('stackPageSideNotes', stackPageSideNotes)}`
  )
}
