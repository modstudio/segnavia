import { embedFunction } from '@segnavia/html'
import { logicalExtent } from './composer-axis-policy.ts'

export interface InlineOverflowMeasurement {
  extentMm: number
  columnWidthMm: number
  clippedMm: number
}

const millimeters = (pixels: number): number => Math.round(((pixels * 25.4) / 96) * 10) / 10

export function inlineOverflowMeasurement(extent: number, columnWidth: number): InlineOverflowMeasurement | undefined {
  if (extent <= columnWidth + 1) return undefined
  return {
    extentMm: millimeters(extent),
    columnWidthMm: millimeters(columnWidth),
    clippedMm: millimeters(extent - columnWidth),
  }
}

export function embeddedComposerInlineOverflowFunctions(): string {
  return `${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('millimeters', millimeters)}
${embedFunction('inlineOverflowMeasurement', inlineOverflowMeasurement)}`
}
