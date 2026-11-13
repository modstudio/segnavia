import { embedFunction } from '@segnavia/html'
import {
  appendMarginOverset,
  appendMissingSideNote,
  appendSideNoteOverset,
  createLineNumber,
  crossedLimit,
  drawLineNumbers,
  drawMarginContent,
  drawPageLineNumbers,
  drawPageSideNotes,
  drawSideNotes,
  intersects,
  lineNumberEdge,
  matchingSideNote,
  physicalColumn,
  prepareSideNote,
  sideNoteCrossing,
  stackPageSideNotes,
  widestLineNumber,
} from './composer-margin.ts'

export function embeddedComposerMarginFunctions(): string {
  return (
    `${embedFunction('intersects', intersects)}\n${embedFunction('physicalColumn', physicalColumn)}\n${embedFunction('lineNumberEdge', lineNumberEdge)}\n${embedFunction('createLineNumber', createLineNumber)}\n${embedFunction('crossedLimit', crossedLimit)}\n${embedFunction('appendMarginOverset', appendMarginOverset)}\n${embedFunction('drawPageLineNumbers', drawPageLineNumbers)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}` +
    `\n${embedFunction('appendSideNoteOverset', appendSideNoteOverset)}\n${embedFunction('appendMissingSideNote', appendMissingSideNote)}\n${embedFunction('matchingSideNote', matchingSideNote)}\n${embedFunction('widestLineNumber', widestLineNumber)}\n${embedFunction('drawPageSideNotes', drawPageSideNotes)}\n${embedFunction('drawSideNotes', drawSideNotes)}\n${embedFunction('drawMarginContent', drawMarginContent)}` +
    `\n${embedFunction('prepareSideNote', prepareSideNote)}\n${embedFunction('sideNoteCrossing', sideNoteCrossing)}\n${embedFunction('stackPageSideNotes', stackPageSideNotes)}`
  )
}
