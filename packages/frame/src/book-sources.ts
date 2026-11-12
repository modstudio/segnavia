import { type OriginApproval, type PageWidths, type PreflightProfileInput, resolvePreflightProfile } from '@segnavia/format'
import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class extends EventTarget {} as typeof HTMLElement)

export abstract class BookSourcesElement extends HTMLElementBase {
  static {
    defineStylesheetPropertyAccessors(BookSourcesElement.prototype, ['origins'])
    defineAsOfPropertyAccessors(BookSourcesElement.prototype)
  }
  declare origins: Iterable<OriginApproval>
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']
  protected fontOptions: FontsOptions | undefined
  protected motifOptions: MotifsOptions | undefined
  protected placementOptions: PlacementsOptions | undefined
  protected widthOptions: PageWidths | undefined
  protected profileInput: PreflightProfileInput = 'default'

  get profile(): PreflightProfileInput {
    return this.profileInput
  }

  set profile(value: PreflightProfileInput) {
    resolvePreflightProfile(value)
    this.profileInput = value
    this.sourcesChanged()
  }

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

  asOfInputsChanged() {
    this.sourcesChanged()
  }
}
