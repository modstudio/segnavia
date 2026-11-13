import type { PreflightEntry } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export interface InlineSpan {
  left: number
  right: number
}

export interface InlineOverflowMeasurement {
  columnWidthMm: number
  clippedMm: number
}

export function inlineColumnSpan(flow: InlineSpan, direction: string, width: number): InlineSpan {
  return direction === 'rtl' ? { left: flow.right - width, right: flow.right } : { left: flow.left, right: flow.left + width }
}

const millimeters = (pixels: number, pxPerMm: number): number => Math.round((pixels / pxPerMm) * 10) / 10

export function inlineOverflowMeasurement(ink: InlineSpan, column: InlineSpan, pxPerMm: number): InlineOverflowMeasurement | undefined {
  const clipped = Math.max(0, column.left - ink.left) + Math.max(0, ink.right - column.right)
  if (clipped <= 1) return undefined
  return {
    columnWidthMm: millimeters(column.right - column.left, pxPerMm),
    clippedMm: millimeters(clipped, pxPerMm),
  }
}

export function inlineOverflowEntry(
  ink: InlineSpan,
  column: InlineSpan,
  resolvedSubject: string,
  folio: string,
  pxPerMm: number,
  subjectLimit: number,
): PreflightEntry | undefined {
  const overflow = inlineOverflowMeasurement(ink, column, pxPerMm)
  if (!overflow) return undefined
  return {
    check: 'inline-overflow',
    subject: resolvedSubject.slice(0, subjectLimit),
    message: `${overflow.clippedMm.toFixed(1)}mm of a block lies outside its ${overflow.columnWidthMm.toFixed(1)}mm column; narrow the block, let it wrap, or widen the column to clear this refusal`,
    location: { folio },
  }
}

export function embeddedComposerInlineOverflowFunctions(): string {
  return `${embedFunction('inlineColumnSpan', inlineColumnSpan)}
${embedFunction('millimeters', millimeters)}
${embedFunction('inlineOverflowMeasurement', inlineOverflowMeasurement)}
${embedFunction('inlineOverflowEntry', inlineOverflowEntry)}`
}
