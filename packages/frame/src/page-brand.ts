import { type Document, pageFromDocument, resolveBrand } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'

export function loadBrandedPage(
  document: Document,
  brands: BrandsOptions | undefined,
  signal: AbortSignal,
  loaded: (page: ReturnType<typeof pageFromDocument>) => void,
  host: EventTarget,
) {
  const current = (work: () => void) => {
    if (!signal.aborted) work()
  }
  if (document.brand === undefined) {
    current(() => loaded(pageFromDocument(document)))
    return
  }
  void resolveBrand(document, brands?.source, signal)
    .then((brand) => current(() => loaded(pageFromDocument(document, brand))))
    .catch((error) => current(() => host.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))))
}
