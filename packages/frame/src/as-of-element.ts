import type { AnchorSource, Zone } from '@segnavia/format'

export interface AsOfElementProperties {
  anchors: AnchorSource | undefined
  asOf: { zone?: Zone } | undefined
  moment: number | undefined
}

interface AsOfElementState {
  anchorOptions?: AnchorSource
  asOfOptions?: { zone?: Zone }
  momentValue?: number
  asOfInputsChanged(): void
}

export function defineAsOfPropertyAccessors(prototype: object): void {
  Object.defineProperties(prototype, {
    anchors: {
      configurable: true,
      get(this: AsOfElementState) {
        return this.anchorOptions
      },
      set(this: AsOfElementState, value: AnchorSource | undefined) {
        this.anchorOptions = value
        this.asOfInputsChanged()
      },
    },
    asOf: {
      configurable: true,
      get(this: AsOfElementState) {
        return this.asOfOptions
      },
      set(this: AsOfElementState, value: { zone?: Zone } | undefined) {
        this.asOfOptions = value
        this.asOfInputsChanged()
      },
    },
    moment: {
      configurable: true,
      get(this: AsOfElementState) {
        return this.momentValue
      },
      set(this: AsOfElementState, value: number | undefined) {
        if (value !== undefined && !Number.isFinite(value)) throw new RangeError('moment must be finite epoch milliseconds.')
        this.momentValue = value
        this.asOfInputsChanged()
      },
    },
  })
}
