import type { AnchorSource, Zone } from '@segnavia/format'

export abstract class DocumentAsOfElement extends HTMLElement {
  protected anchorOptions: AnchorSource | undefined
  protected asOfOptions: { zone?: Zone } | undefined
  protected momentValue: number | undefined
  protected loadMoment = 0

  get anchors(): AnchorSource | undefined {
    return this.anchorOptions
  }
  set anchors(value: AnchorSource | undefined) {
    this.anchorOptions = value
    this.asOfInputsChanged()
  }
  get asOf(): { zone?: Zone } | undefined {
    return this.asOfOptions
  }
  set asOf(value: { zone?: Zone } | undefined) {
    this.asOfOptions = value
    this.asOfInputsChanged()
  }
  get moment(): number | undefined {
    return this.momentValue
  }
  set moment(value: number | undefined) {
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError('moment must be finite epoch milliseconds.')
    this.momentValue = value
    this.asOfInputsChanged()
  }

  protected abstract asOfInputsChanged(): void
}
