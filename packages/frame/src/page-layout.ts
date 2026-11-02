import { type PageSize, type PageWidths, resolvePageWidth } from '@segnavia/format'

export interface PageSheetLayout {
  inlineSize: number
  inlineStart: number
  maxInlineSize?: number
}

export function pageSheetLayout(size: PageSize, availableInlineSize: number, pageWidths?: PageWidths): PageSheetLayout {
  const width = resolvePageWidth(size, pageWidths)
  if (typeof size.width === 'number') return { inlineSize: width.viewportWidth, inlineStart: 0 }
  if (width.measure === undefined) return { inlineSize: availableInlineSize, inlineStart: 0 }
  const inlineSize = Math.min(availableInlineSize, width.measure)
  return { inlineSize, inlineStart: (availableInlineSize - inlineSize) / 2, maxInlineSize: width.measure }
}
