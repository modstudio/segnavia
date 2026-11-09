import type { AnchorSource, Zone } from '@segnavia/format'

export interface AsOfElementProperties {
  anchors: AnchorSource | undefined
  asOf: { zone?: Zone } | undefined
  moment: number | undefined
}

interface AsOfElementHost {
  asOfInputsChanged(): void
}

interface AsOfElementState {
  anchorOptions?: AnchorSource
  asOfOptions?: { zone?: Zone }
  momentValue?: number
}

const states = new WeakMap<object, AsOfElementState>()
const state = (element: object): AsOfElementState => {
  const held = states.get(element) ?? {}
  states.set(element, held)
  return held
}

export function captureAsOfLoad(element: object): { moment: number; hostZone?: Zone; anchors?: AnchorSource } {
  const held = state(element)
  return { moment: held.momentValue ?? Date.now(), hostZone: held.asOfOptions?.zone, anchors: held.anchorOptions }
}

export function defineAsOfPropertyAccessors(prototype: object): void {
  Object.defineProperties(prototype, {
    anchors: {
      configurable: true,
      get(this: object) {
        return state(this).anchorOptions
      },
      set(this: AsOfElementHost, value: AnchorSource | undefined) {
        state(this).anchorOptions = value
        this.asOfInputsChanged()
      },
    },
    asOf: {
      configurable: true,
      get(this: object) {
        return state(this).asOfOptions
      },
      set(this: AsOfElementHost, value: { zone?: Zone } | undefined) {
        state(this).asOfOptions = value
        this.asOfInputsChanged()
      },
    },
    moment: {
      configurable: true,
      get(this: object) {
        return state(this).momentValue
      },
      set(this: AsOfElementHost, value: number | undefined) {
        if (value !== undefined && !Number.isFinite(value)) throw new RangeError('moment must be finite epoch milliseconds.')
        state(this).momentValue = value
        this.asOfInputsChanged()
      },
    },
  })
}
