import { type Document, type OriginApproval, pageOrPrintedFromDocument, resolveBrand } from '@segnavia/format'
import { type HtmlPage, resolvePageHtml } from '@segnavia/html'
import type { BrandsOptions } from './brands.ts'

export function resolveDocumentBrands(
  documents: Document[],
  brands: BrandsOptions | undefined,
  origins: Iterable<OriginApproval>,
  current: () => boolean,
  commit: (sources: ReturnType<typeof pageOrPrintedFromDocument>[], pages: HtmlPage[]) => void,
  refuse: (error: unknown) => void,
): AbortController {
  const controller = new AbortController()
  const resolved = (values: Awaited<ReturnType<typeof resolveBrand>>[]) => {
    if (!current() || controller.signal.aborted) return
    const sources = documents.map((document, index) => pageOrPrintedFromDocument(document, values[index]))
    commit(
      sources,
      sources.map((page) => resolvePageHtml(page, { origins })),
    )
  }
  if (!documents.some((document) => document.brand !== undefined)) resolved(documents.map(() => undefined))
  else
    void Promise.all(documents.map((document) => resolveBrand(document, brands?.source, controller.signal)))
      .then(resolved)
      .catch((error) => {
        if (current() && !controller.signal.aborted) refuse(error)
      })
  return controller
}

export class DocumentBrandLoader {
  private controller: AbortController | undefined

  constructor(
    private readonly current: () => Document[],
    private readonly commit: (sources: ReturnType<typeof pageOrPrintedFromDocument>[], pages: HtmlPage[]) => void,
    private readonly refuse: (error: unknown) => void,
  ) {}

  abort(): void {
    this.controller?.abort()
  }

  resolve(documents: Document[], brands: BrandsOptions | undefined, origins: Iterable<OriginApproval>): void {
    this.abort()
    this.controller = resolveDocumentBrands(documents, brands, origins, () => documents === this.current(), this.commit, this.refuse)
  }
}
