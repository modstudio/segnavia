import {
  type Book,
  LIBRARY_HEAD_TEMPLATES,
  type ParentPage,
  pressBoxes,
  resolveParentPages,
  sheetMm,
  usesPressLayout,
  withLibraryEntries,
} from '@segnavia/format'
import { fillRegion, resolveRegionHeads } from '@segnavia/frame/composer'
import type { BookPrintedPagePlan } from '@segnavia/html'

export function marginCss(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  const bleed = book.print && usesPressLayout(book.print) ? book.print.bleed : 0
  const source = book.print && usesPressLayout(book.print) ? pressBoxes(size, book.print).bleedBox : size
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  const geometry = pages
    .map((page, index) => {
      const edge = byName.get(page.parent)?.margin
      if (!edge) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const selector = `.segnavia-margin-page:nth-of-type(${index + 1})`
      const inline =
        page.side === 'left'
          ? `inset-inline-start:${edge.inlineEnd}mm;inset-inline-end:${edge.inlineStart}mm;justify-content:flex-start`
          : `inset-inline-start:${edge.inlineStart}mm;inset-inline-end:${edge.inlineEnd}mm;justify-content:flex-end`
      return (
        `:where(${selector} .segnavia-running-head){inset-block-start:0;block-size:${edge.blockStart}mm;${inline}}` +
        `:where(${selector} .segnavia-folio){inset-block-end:0;block-size:${edge.blockEnd}mm;${inline}}`
      )
    })
    .join('')
  return (
    `@page{size:${source.width}mm ${source.height}mm;margin:${bleed}mm}` +
    `:where(html,body){margin:0}` +
    `:where(.segnavia-margin-page){position:relative;inline-size:${size.width}mm;block-size:${size.height}mm;break-after:page;direction:ltr}` +
    `:where(.segnavia-running-head,.segnavia-folio){position:absolute;display:flex;align-items:center}` +
    geometry
  )
}

function furniture(book: Book, html: string, page: BookPrintedPagePlan): string {
  const heads = resolveRegionHeads(withLibraryEntries(LIBRARY_HEAD_TEMPLATES, book.headTemplates), page.variables ?? {}, page.recordSlots ?? {}, book.dir, book.lang)
  return fillRegion(html, { heads }, book.dir, book.lang)
}

export function marginDocument(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  return pages
    .map((page) => {
      const parent = byName.get(page.parent)
      if (!parent) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const head = furniture(book, parent.head, page)
      const foot = furniture(book, parent.foot, page)
      return `<div class="segnavia-margin-page" data-side="${page.side}" data-segnavia-side="${page.face}">${head}${foot}</div>`
    })
    .join('')
}
