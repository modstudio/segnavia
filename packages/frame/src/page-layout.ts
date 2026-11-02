import { type PageSize, type PageWidths, resolvePageWidth } from '@segnavia/format'

export interface PageSheetLayout {
  inlineSize: string
  maxInlineSize?: number
  marginInline?: 'auto'
}

export function pageSheetLayout(size: PageSize, pageWidths?: PageWidths): PageSheetLayout {
  const width = resolvePageWidth(size, pageWidths)
  if (typeof size.width === 'number') return { inlineSize: `${width.viewportWidth}px` }
  if (width.measure === undefined) return { inlineSize: '100%' }
  return { inlineSize: '100%', maxInlineSize: width.measure, marginInline: 'auto' }
}
