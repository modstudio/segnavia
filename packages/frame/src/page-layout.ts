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

export interface PageFitLayout {
  sheetHeight: string
  transform: string
  hostHeight: string
  measuredHeight?: number
}

export function pagePrintedFitLayout(bounded: boolean, hasReport: boolean, contentHeight: number): PageFitLayout {
  const measuredHeight = !bounded && hasReport ? contentHeight : undefined
  return {
    sheetHeight: '',
    transform: '',
    hostHeight: measuredHeight === undefined ? '' : `${measuredHeight}px`,
    ...(measuredHeight === undefined ? {} : { measuredHeight }),
  }
}

export function pageFitLayout(size: PageSize, bounded: boolean, clientWidth: number, contentHeight: number): PageFitLayout {
  if (size.height === 'auto' && size.width === 'full' && bounded) {
    return { sheetHeight: '100%', transform: '', hostHeight: '', ...(contentHeight ? { measuredHeight: contentHeight } : {}) }
  }
  const width = typeof size.width === 'number' ? size.width : null
  const scale = width === null ? 1 : Math.min(1, clientWidth / width)
  const height = contentHeight || 150
  return {
    sheetHeight: `${height}px`,
    transform: scale === 1 ? '' : `scale(${scale})`,
    hostHeight: `${Math.ceil(height * scale)}px`,
    measuredHeight: height,
  }
}
