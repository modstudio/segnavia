import type { PageWidths } from '@segnavia/format'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export abstract class BookSourcesElement extends HTMLElementBase {
  static {
    defineStylesheetPropertyAccessors(BookSourcesElement.prototype, ['dependencyOrigins'])
  }
  declare dependencyOrigins: Iterable<string>
  protected fontOptions: FontsOptions | undefined
  protected brandOptions: BrandsOptions | undefined
  protected motifOptions: MotifsOptions | undefined
  protected placementOptions: PlacementsOptions | undefined
  protected widthOptions: PageWidths | undefined

  get spread(): boolean {
    return this.hasAttribute('spread')
  }

  set spread(value: boolean) {
    this.toggleAttribute('spread', value)
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    this.sourcesChanged()
  }
  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }
  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
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
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.widthOptions = parsed
    this.sourcesChanged()
  }

  protected abstract sourcesChanged(): void
}
