import { PREFLIGHT_SUBJECT_LIMIT, type PreflightEntry, PX_PER_MM } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { logicalExtent, verticalWritingMode } from './composer-axis-policy.ts'

export interface InlineOverflowMeasurement {
  extentMm: number
  columnWidthMm: number
  clippedMm: number
}

export function inlineOverflowExtent(rect: { width: number; height: number }, flowWritingMode: string, ink: { inline: number }): number {
  return logicalExtent(rect, flowWritingMode, 'inline') + ink.inline
}

const millimeters = (pixels: number): number => Math.round((pixels / PX_PER_MM) * 10) / 10

export function inlineOverflowMeasurement(extent: number, columnWidth: number): InlineOverflowMeasurement | undefined {
  if (extent <= columnWidth + 1) return undefined
  return {
    extentMm: millimeters(extent),
    columnWidthMm: millimeters(columnWidth),
    clippedMm: millimeters(extent - columnWidth),
  }
}

export function inlineOverflowEntry(
  extent: number,
  columnWidth: number,
  idCandidates: readonly (string | null | undefined)[],
  flowId: string,
  tag: string,
  blockIndex: number,
  folio: string,
): PreflightEntry | undefined {
  const overflow = inlineOverflowMeasurement(extent, columnWidth)
  if (!overflow) return undefined
  const identified = idCandidates.find((candidate) => candidate !== null && candidate !== undefined && candidate !== '')
  const subject = (identified ?? `${flowId} ${tag} block ${blockIndex}`).slice(0, PREFLIGHT_SUBJECT_LIMIT)
  return {
    check: 'inline-overflow',
    subject,
    message: `a block is ${overflow.extentMm.toFixed(1)}mm wide in a ${overflow.columnWidthMm.toFixed(1)}mm column, so ${overflow.clippedMm.toFixed(1)}mm is clipped; narrow the block, let it wrap, or widen the column to clear this refusal`,
    location: { folio },
  }
}

export function embeddedComposerInlineOverflowFunctions(): string {
  return `${embedFunction('verticalWritingMode', verticalWritingMode)}
${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('inlineOverflowExtent', inlineOverflowExtent)}
${embedFunction('millimeters', millimeters)}
${embedFunction('inlineOverflowMeasurement', inlineOverflowMeasurement)}
${embedFunction('inlineOverflowEntry', inlineOverflowEntry)}`
}
