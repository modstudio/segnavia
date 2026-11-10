import {
  type Book,
  LIBRARY_HEAD_TEMPLATES,
  type ParentPage,
  pressBoxes,
  resolveDirection,
  resolveParentPages,
  sheetMm,
  textArea,
  usesPressLayout,
  withLibraryEntries,
} from '@segnavia/format'
import { fillRegion, resolveRegionHeads } from '@segnavia/frame/composer'
import type { BookPrintedPagePlan } from '@segnavia/html'
import { regionBox } from '@segnavia/layout'

export function marginCss(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  const bleed = book.print && usesPressLayout(book.print) ? book.print.bleed : 0
  const source = book.print && usesPressLayout(book.print) ? pressBoxes(size, book.print).bleedBox : size
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  const direction = resolveDirection(book.dir, book.lang, book.title)
  const geometry = pages
    .map((page, index) => {
      const parent = byName.get(page.parent)
      if (!parent) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const selector = `.segnavia-margin-page:nth-of-type(${index + 1})`
      const area = textArea(parent, size)
      return Object.entries(parent.regions)
        .map(([name, region]) => {
          const box = regionBox(region.edge, parent.margin, area, { direction, face: page.face })
          return `:where(${selector} [data-segnavia-region="${name}"]){inset-block-start:${box.top}mm;inset-inline-start:${box.left}mm;inline-size:${box.width}mm;block-size:${box.height}mm}`
        })
        .join('')
    })
    .join('')
  return (
    `@page{size:${source.width}mm ${source.height}mm;margin:${bleed}mm}` +
    `:where(html,body){margin:0}` +
    `:where(.segnavia-margin-page){position:relative;inline-size:${size.width}mm;block-size:${size.height}mm;break-after:page;direction:ltr}` +
    `:where([data-segnavia-region]){position:absolute;overflow:hidden}` +
    geometry
  )
}

function furniture(book: Book, html: string, page: BookPrintedPagePlan): string {
  const heads = resolveRegionHeads(
    withLibraryEntries(LIBRARY_HEAD_TEMPLATES, book.headTemplates),
    page.variables ?? {},
    page.recordSlots ?? {},
    book.dir,
    book.lang,
  )
  return fillRegion(html, { heads }, book.dir, book.lang)
}

export function marginDocument(book: Book, pages: BookPrintedPagePlan[], parents: ParentPage[]): string {
  const byName = new Map(resolveParentPages(parents).map((parent) => [parent.name, parent]))
  return pages
    .map((page) => {
      const parent = byName.get(page.parent)
      if (!parent) throw new Error(`The book margin plan names unknown parent page "${page.parent}".`)
      const regions = Object.entries(parent.regions)
        .map(
          ([name, region]) =>
            `<div data-segnavia-region="${name}" data-segnavia-edge="${region.edge}" data-segnavia-parent="${parent.name}" dir="auto">${furniture(book, region.html, page)}</div>`,
        )
        .join('')
      return `<div class="segnavia-margin-page" data-side="${page.side}" data-segnavia-side="${page.face}">${regions}</div>`
    })
    .join('')
}
