import {
  type Book,
  type ParentPage,
  PRINTED_PAGE_FOLIO_PATH,
  PRINTED_PAGE_RUNNING_HEAD_PATH,
  resolveDirection,
  resolveParentPages,
  sheetMm,
} from '@segnavia/format'
import type { BookPrintedPagePlan } from '@segnavia/html'

const BUILT_IN_MOTIFS = {
  'segnavia:folio': `<bdi data-slot-value="${PRINTED_PAGE_FOLIO_PATH}"></bdi>`,
  'segnavia:running-head': `<bdi data-slot-value="${PRINTED_PAGE_RUNNING_HEAD_PATH}"></bdi>`,
} as const

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function marginCss(book: Book): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  const edge = book.page.margin
  return (
    `@page{size:${size.width}mm ${size.height}mm;margin:0}` +
    `:where(html,body){margin:0}` +
    `:where(.segnavia-margin-page){position:relative;inline-size:${size.width}mm;block-size:${size.height}mm;break-after:page;direction:ltr}` +
    `:where(.segnavia-running-head,.segnavia-folio){position:absolute;display:flex;align-items:center}` +
    `:where(.segnavia-running-head){inset-block-start:0;block-size:${edge.top}mm}` +
    `:where(.segnavia-folio){inset-block-end:0;block-size:${edge.bottom}mm}` +
    `:where([data-side="left"] .segnavia-running-head,[data-side="left"] .segnavia-folio){inset-inline-start:${edge.outer}mm;inset-inline-end:${edge.inner}mm;justify-content:flex-start}` +
    `:where([data-side="right"] .segnavia-running-head,[data-side="right"] .segnavia-folio){inset-inline-start:${edge.inner}mm;inset-inline-end:${edge.outer}mm;justify-content:flex-end}`
  )
}

function furniture(book: Book, html: string, page: BookPrintedPagePlan): string {
  const key = html.includes('data-motif="segnavia:folio"')
    ? 'segnavia:folio'
    : html.includes('data-motif="segnavia:running-head"')
      ? 'segnavia:running-head'
      : undefined
  if (!key) return ''
  const value = key === 'segnavia:folio' ? page.folio : page.runningHead
  if (value === undefined) return ''
  const path = key === 'segnavia:folio' ? PRINTED_PAGE_FOLIO_PATH : PRINTED_PAGE_RUNNING_HEAD_PATH
  const bound = BUILT_IN_MOTIFS[key]
    .replace(` data-slot-value="${path}"`, ` dir="${resolveDirection(book.dir, book.lang, value)}"`)
    .replace('</bdi>', `${escapeHtml(value)}</bdi>`)
  return html.replace(/ data-motif="segnavia:(?:folio|running-head)"/, '').replace('></div>', `>${bound}</div>`)
}

export function marginDocument(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  return pages
    .map((page) => {
      const parent = byName.get(page.parent)
      if (!parent) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const head = furniture(book, parent.head, page)
      const foot = furniture(book, parent.foot, page)
      return `<div class="segnavia-margin-page" data-side="${page.side}">${head}${foot}</div>`
    })
    .join('')
}
