import { type PageWidths, type PreflightProfileInput, resolvePreflightProfile, type SlotsOptions } from '@segnavia/format'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { PageParseOptionsElement } from './page-parse-options-element.ts'
import { PRINTED_PAGES_FITS, PRINTED_PAGES_LAYOUTS, type PrintedPagesFit, type PrintedPagesLayout, printedPagesOption } from './printed-pages-policy.ts'

const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number.`)
  return value
}
const nonNegative = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number.`)
  return value
}

export abstract class PrintedPagesOptionsElement extends PageParseOptionsElement {
  protected layoutValue: PrintedPagesLayout = 'single'
  protected fitValue: PrintedPagesFit = 'width'
  protected zoomValue = 1
  protected composeMarginValue = 1
  protected keepMarginValue = 3
  protected reloadDelayValue = 150
  protected slotsValue: SlotsOptions | undefined
  protected motifsValue: MotifsOptions | undefined
  protected placementsValue: PlacementsOptions | undefined
  protected widthsValue: PageWidths | undefined
  protected fontsValue: FontsOptions | undefined
  protected profileValue: PreflightProfileInput = 'default'

  get layout(): PrintedPagesLayout {
    return this.layoutValue
  }
  set layout(value: PrintedPagesLayout) {
    this.layoutValue = printedPagesOption(value, PRINTED_PAGES_LAYOUTS, 'layout')
    this.printedPagesReload()
  }
  get fit(): PrintedPagesFit {
    return this.fitValue
  }
  set fit(value: PrintedPagesFit) {
    this.fitValue = printedPagesOption(value, PRINTED_PAGES_FITS, 'fit')
    this.printedPagesReload()
  }
  get zoom(): number {
    return this.zoomValue
  }
  set zoom(value: number) {
    this.zoomValue = positive(value, 'zoom')
    this.printedPagesReload()
  }
  get composeMargin(): number {
    return this.composeMarginValue
  }
  set composeMargin(value: number) {
    this.composeMarginValue = nonNegative(value, 'composeMargin')
    this.printedPagesWindowChanged()
  }
  get keepMargin(): number {
    return this.keepMarginValue
  }
  set keepMargin(value: number) {
    this.keepMarginValue = nonNegative(value, 'keepMargin')
    this.printedPagesWindowChanged()
  }
  get reloadDelay(): number {
    return this.reloadDelayValue
  }
  set reloadDelay(value: number) {
    this.reloadDelayValue = nonNegative(value, 'reloadDelay')
  }
  get slots(): SlotsOptions | undefined {
    return this.slotsValue
  }
  set slots(value: SlotsOptions | undefined) {
    this.slotsValue = value
    this.printedPagesReload()
  }
  get motifs(): MotifsOptions | undefined {
    return this.motifsValue
  }
  set motifs(value: MotifsOptions | undefined) {
    this.motifsValue = value
    this.printedPagesReload()
  }
  get placements(): PlacementsOptions | undefined {
    return this.placementsValue
  }
  set placements(value: PlacementsOptions | undefined) {
    this.placementsValue = value
    this.printedPagesReload()
  }
  get pageWidths(): PageWidths | undefined {
    return this.widthsValue
  }
  set pageWidths(value: PageWidths | undefined) {
    this.widthsValue = value
    this.printedPagesReload()
  }
  get fonts(): FontsOptions | undefined {
    return this.fontsValue
  }
  set fonts(value: FontsOptions | undefined) {
    this.fontsValue = value
    this.printedPagesReload()
  }
  get profile(): PreflightProfileInput {
    return this.profileValue
  }
  set profile(value: PreflightProfileInput) {
    resolvePreflightProfile(value)
    this.profileValue = value
    this.printedPagesReload()
  }

  protected abstract printedPagesReload(): void
  protected abstract printedPagesWindowChanged(): void
}

export function positivePrintedPagesOption(value: number, name: string): number {
  return positive(value, name)
}
