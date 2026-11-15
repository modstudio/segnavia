import { type Document, type Page, pageOrPrintedFromDocument } from '@segnavia/format'
import { type HtmlPage, resolveEdition, resolvePageHtml } from '@segnavia/html'
import { refuseSectionedImpositionPage } from './print-document.ts'

export function resolvePaperPageValues(pages: Page[]): HtmlPage[] {
  return pages.map((page) => {
    refuseSectionedImpositionPage(page)
    return resolvePageHtml(page)
  })
}

export function resolvePaperDocuments(documents: Document[], edition: string | undefined): { documents: Document[]; pages: HtmlPage[] } {
  const resolved = documents.map((document) => resolveEdition(document, edition))
  return { documents: resolved, pages: resolvePaperPageValues(resolved.map((document) => pageOrPrintedFromDocument(document))) }
}
