import { embedFunction } from '@segnavia/html'
import { appendMarginOverset, createLineNumber, crossedLimit, drawLineNumbers, drawPageLineNumbers, intersects } from './composer-margin.ts'

export function embeddedComposerMarginFunctions(): string {
  return `${embedFunction('intersects', intersects)}\n${embedFunction('createLineNumber', createLineNumber)}\n${embedFunction('crossedLimit', crossedLimit)}\n${embedFunction('appendMarginOverset', appendMarginOverset)}\n${embedFunction('drawPageLineNumbers', drawPageLineNumbers)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}`
}
