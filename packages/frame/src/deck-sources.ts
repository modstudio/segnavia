import type { AssetPlacementsOptions } from './board-policy.ts'
import type { DeckController } from './controller.ts'

export abstract class DeckSourcesElement extends HTMLElement {
  abstract readonly controller: DeckController

  set placements(value: AssetPlacementsOptions | undefined) {
    this.controller.placements = value
  }
}
