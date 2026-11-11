import type { OriginApproval, PageWidths, SlotsOptions } from '@segnavia/format'
import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'
import type { AssetPlacementsOptions } from './board-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'

export class ThumbnailProperties extends HTMLElement {
  static {
    defineAsOfPropertyAccessors(ThumbnailProperties.prototype)
  }
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']
  private originOptions: readonly OriginApproval[] = []
  private stylesheet = ''
  protected baseUrl: string | undefined
  protected slotOptions: SlotsOptions | undefined
  protected motifOptions: MotifsOptions | undefined
  protected placementOptions: AssetPlacementsOptions | undefined
  protected widthOptions: PageWidths | undefined
  protected fontOptions: FontsOptions | undefined

  /** The host stylesheet an HTML slide is drawn with, as the stage's `css`. */
  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.thumbnailPropertiesChanged()
  }

  get origins(): Iterable<OriginApproval> {
    return this.originOptions
  }

  set origins(value: Iterable<OriginApproval>) {
    this.originOptions = [...value]
    this.thumbnailPropertiesChanged()
  }

  get base(): string | undefined {
    return this.baseUrl
  }

  set base(value: string | undefined) {
    this.baseUrl = value
    this.thumbnailPropertiesChanged()
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    this.thumbnailPropertiesChanged()
  }

  get placements(): AssetPlacementsOptions | undefined {
    return this.placementOptions
  }

  set placements(value: AssetPlacementsOptions | undefined) {
    this.placementOptions = value
    this.thumbnailPropertiesChanged()
  }

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.widthOptions = parsed
    this.thumbnailPropertiesChanged()
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    this.thumbnailPropertiesChanged()
  }

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    this.thumbnailPropertiesChanged()
  }

  protected thumbnailPropertiesChanged(): void {}

  protected asOfInputsChanged(): void {
    this.thumbnailPropertiesChanged()
  }
}
