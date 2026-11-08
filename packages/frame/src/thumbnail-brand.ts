import { type Brand, type Document, resolveBrand } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'

export function resolveThumbnailDocument<T>(
  document: Document,
  brands: BrandsOptions | undefined,
  lower: (document: Document, brand?: Brand) => T,
  loaded: (value: T) => void,
  failed: (error: unknown) => void,
): AbortController | undefined {
  if (document.brand === undefined) {
    loaded(lower(document))
    return undefined
  }
  const controller = new AbortController()
  void resolveBrand(document, brands?.source, controller.signal)
    .then((brand) => {
      if (!controller.signal.aborted) loaded(lower(document, brand))
    })
    .catch((error) => {
      if (!controller.signal.aborted) failed(error)
    })
  return controller
}
