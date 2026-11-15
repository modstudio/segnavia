import type { BrandsOptions } from './brands.ts'
import { DeckController } from './controller.ts'
import { editionAttribute } from './edition-property.ts'

interface StageSource extends HTMLElement {
  brands: BrandsOptions | undefined
}

export function createStageSourceController(stage: StageSource): DeckController {
  const hash = stage.getAttribute('hash')
  return new DeckController({
    hash: hash === 'off' ? null : (hash ?? 'slide-'),
    prefetch: stage.hasAttribute('prefetch'),
    brands: stage.brands,
    edition: editionAttribute(stage),
  })
}
