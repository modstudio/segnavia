import { type Document, pageFromDocument, resolveBrand } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'

export function loadBrandedPage(
  document: Document,
  brands: BrandsOptions | undefined,
  loaded: (page: ReturnType<typeof pageFromDocument>) => void,
  host: EventTarget,
) {
  if (document.brand === undefined) {
    loaded(pageFromDocument(document))
    return
  }
  const signal = new AbortController().signal
  void resolveBrand(document, brands?.source, signal)
    .then((brand) => loaded(pageFromDocument(document, brand)))
    .catch((error) => host.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) })))
}
