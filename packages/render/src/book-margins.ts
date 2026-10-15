import { type Book, resolveDirection, sheetMm } from '@segnavia/format'
import type { BookSectionInfo } from '@segnavia/html'

export interface MarginPage {
  kind: BookSectionInfo['kind'] | 'blank'
  folio?: string
  runningHead?: string
  side: 'left' | 'right'
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function marginDocument(book: Book, pages: MarginPage[]): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  const edge = book.page.margin
  const css =
    `@page{size:${size.width}mm ${size.height}mm;margin:0}` +
    `:where(html,body){margin:0}` +
    `:where(.segnavia-margin-page){position:relative;inline-size:${size.width}mm;block-size:${size.height}mm;break-after:page;direction:ltr}` +
    `:where(.segnavia-running-head,.segnavia-folio){position:absolute;display:flex;align-items:center}` +
    `:where(.segnavia-running-head){inset-block-start:0;block-size:${edge.top}mm}` +
    `:where(.segnavia-folio){inset-block-end:0;block-size:${edge.bottom}mm}` +
    `:where([data-side="left"] .segnavia-running-head,[data-side="left"] .segnavia-folio){inset-inline-start:${edge.outer}mm;inset-inline-end:${edge.inner}mm;justify-content:flex-start}` +
    `:where([data-side="right"] .segnavia-running-head,[data-side="right"] .segnavia-folio){inset-inline-start:${edge.inner}mm;inset-inline-end:${edge.outer}mm;justify-content:flex-end}`
  const html = pages
    .map((page) => {
      const head =
        page.runningHead === undefined
          ? ''
          : `<div class="segnavia-running-head"><bdi dir="${resolveDirection(book.dir, book.lang, page.runningHead)}">${escapeHtml(page.runningHead)}</bdi></div>`
      const folio =
        page.folio === undefined
          ? ''
          : `<div class="segnavia-folio"><bdi dir="${resolveDirection(book.dir, book.lang, page.folio)}">${escapeHtml(page.folio)}</bdi></div>`
      return `<div class="segnavia-margin-page" data-side="${page.side}">${head}${folio}</div>`
    })
    .join('')
  return `<style>${css}</style>${html}`
}
