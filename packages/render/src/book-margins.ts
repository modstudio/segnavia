import { type Book, type ParentPage, resolveParentPages, sheetMm } from '@segnavia/format'
import { type BookPrintedPagePlan, fillBookFurniture } from '@segnavia/html'

export function marginCss(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  const geometry = pages
    .map((page, index) => {
      const edge = byName.get(page.parent)?.margin
      if (!edge) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const selector = `.segnavia-margin-page:nth-of-type(${index + 1})`
      const inline =
        page.side === 'left'
          ? `inset-inline-start:${edge.outer}mm;inset-inline-end:${edge.inner}mm;justify-content:flex-start`
          : `inset-inline-start:${edge.inner}mm;inset-inline-end:${edge.outer}mm;justify-content:flex-end`
      return (
        `:where(${selector} .segnavia-running-head){inset-block-start:0;block-size:${edge.top}mm;${inline}}` +
        `:where(${selector} .segnavia-folio){inset-block-end:0;block-size:${edge.bottom}mm;${inline}}`
      )
    })
    .join('')
  return (
    `@page{size:${size.width}mm ${size.height}mm;margin:0}` +
    `:where(html,body){margin:0}` +
    `:where(.segnavia-margin-page){position:relative;inline-size:${size.width}mm;block-size:${size.height}mm;break-after:page;direction:ltr}` +
    `:where(.segnavia-running-head,.segnavia-folio){position:absolute;display:flex;align-items:center}` +
    geometry
  )
}

function furniture(book: Book, html: string, page: BookPrintedPagePlan): string {
  return fillBookFurniture(html, { folio: page.folio, runningHead: page.runningHead }, book.dir, book.lang)
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
