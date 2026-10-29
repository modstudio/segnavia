import { MM_PER_PT } from '@segnavia/format'
import type { IdmlBounds, IdmlMargin } from './types.ts'

export function formatRoundedNumber(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export interface PositionedBoxOptions {
  pageWidth: number
  margin: IdmlMargin
  rtl: boolean
  blockOrigin: number
  unit: 'pt' | 'mm'
}

export function positionedBoxStyle(bounds: IdmlBounds, options: PositionedBoxOptions): string {
  const scale = options.unit === 'mm' ? MM_PER_PT : 1
  const digits = options.unit === 'mm' ? 6 : 2
  const value = (points: number) => `${formatRoundedNumber(points * scale, digits)}${options.unit}`
  const inlineStart = options.rtl ? options.pageWidth - options.margin.right - bounds.right : bounds.left - options.margin.left
  return `position:absolute;inset-inline-start:${value(inlineStart)};inline-size:${value(bounds.right - bounds.left)};inset-block-start:${value(bounds.top - options.blockOrigin)};block-size:${value(bounds.bottom - bounds.top)}`
}
