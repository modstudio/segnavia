import { type Document, pageOrPrintedFromDocument, resolveBrand } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'
import { dispatchElementError } from './element-error.ts'

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
    .catch((error) => current(() => dispatchElementError(host, error)))
}
