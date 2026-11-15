import type { BrandsOptions } from './brands.ts'
import { DeckController } from './controller.ts'
import { editionAttribute } from './edition-property.ts'

interface ControllerSource extends HTMLElement {
  brands?: BrandsOptions | undefined
}

export function createSourceController(source: ControllerSource): DeckController {
  const hash = source.getAttribute('hash')
  return new DeckController({
    hash: hash === 'off' ? null : (hash ?? 'slide-'),
    prefetch: source.hasAttribute('prefetch'),
    brands: source.brands,
    edition: editionAttribute(source),
  })
}
