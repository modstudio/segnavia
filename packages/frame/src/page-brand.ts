import { type Document, pageOrPrintedFromDocument, resolveBrand } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'

export function loadBrandedPage(
  document: Document,
  brands: BrandsOptions | undefined,
  signal: AbortSignal,
  loaded: (page: ReturnType<typeof pageOrPrintedFromDocument>) => void,
  host: EventTarget,
) {
  const current = (work: () => void) => {
    if (!signal.aborted) work()
  }
  if (document.brand === undefined) {
    current(() => loaded(pageOrPrintedFromDocument(document)))
    return
  }
  void resolveBrand(document, brands?.source, signal)
    .then((brand) => current(() => loaded(pageOrPrintedFromDocument(document, brand))))
    .catch((error) => current(() => host.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))))
}
