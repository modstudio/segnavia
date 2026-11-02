import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export abstract class BookSourcesElement extends HTMLElementBase {
  protected fontOptions: FontsOptions | undefined
  protected motifOptions: MotifsOptions | undefined
  protected placementOptions: PlacementsOptions | undefined

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    this.sourcesChanged()
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    this.sourcesChanged()
  }

  get placements(): PlacementsOptions | undefined {
    return this.placementOptions
  }

  set placements(value: PlacementsOptions | undefined) {
    this.placementOptions = value
    this.sourcesChanged()
  }

  protected abstract sourcesChanged(): void
}
