import type { PageWidths } from '@segnavia/format'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export abstract class BookSourcesElement extends HTMLElementBase {
  protected fontOptions: FontsOptions | undefined
  protected motifOptions: MotifsOptions | undefined
  protected placementOptions: PlacementsOptions | undefined
  protected widthOptions: PageWidths | undefined

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

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    this.widthOptions = value
    this.sourcesChanged()
  }

  protected abstract sourcesChanged(): void
}
