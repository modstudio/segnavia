import { embedFunction } from '@segnavia/html'
import {
  appendMarginOverset,
  appendSideNoteOverset,
  createLineNumber,
  crossedLimit,
  drawLineNumbers,
  drawMarginContent,
  drawPageSideNotes,
  drawPageLineNumbers,
  drawSideNotes,
  intersects,
  lineNumberEdge,
  physicalColumn,
  matchingSideNote,
  widestLineNumber,
} from './composer-margin.ts'

export function embeddedComposerMarginFunctions(): string {
  return `${embedFunction('intersects', intersects)}\n${embedFunction('physicalColumn', physicalColumn)}\n${embedFunction('lineNumberEdge', lineNumberEdge)}\n${embedFunction('createLineNumber', createLineNumber)}\n${embedFunction('crossedLimit', crossedLimit)}\n${embedFunction('appendMarginOverset', appendMarginOverset)}\n${embedFunction('drawPageLineNumbers', drawPageLineNumbers)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}`
    + `\n${embedFunction('appendSideNoteOverset', appendSideNoteOverset)}\n${embedFunction('matchingSideNote', matchingSideNote)}\n${embedFunction('widestLineNumber', widestLineNumber)}\n${embedFunction('drawPageSideNotes', drawPageSideNotes)}\n${embedFunction('drawSideNotes', drawSideNotes)}\n${embedFunction('drawMarginContent', drawMarginContent)}`
}
