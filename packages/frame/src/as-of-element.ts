import { type AsOfDay, carryMoment, type Zone } from '@segnavia/format'
import { type AsOfInputs, parseAsOfInputs } from '@segnavia/html'

export interface AsOfElementProperties extends Pick<AsOfInputs, 'anchors' | 'moment'> {
  asOf: { zone?: Zone } | undefined
}

export const HTMLElementBase = globalThis.HTMLElement ?? (class extends EventTarget {} as typeof HTMLElement)

export abstract class AsOfElement extends HTMLElementBase {
  static {
    defineAsOfPropertyAccessors(AsOfElement.prototype)
  }
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']

  protected abstract asOfInputsChanged(): void
}

interface AsOfElementHost {
  asOfInputsChanged(): void
}

interface AsOfElementState {
  anchorOptions?: AsOfInputs['anchors']
  asOfOptions?: { zone?: Zone }
  momentValue?: number
}

const states = new WeakMap<object, AsOfElementState>()
const state = (element: object): AsOfElementState => {
  const held = states.get(element) ?? {}
  states.set(element, held)
  return held
}

export function captureAsOfLoad(element: object): { moment: number; hostMoment?: number; hostZone?: Zone; anchors?: AsOfInputs['anchors'] } {
  const held = state(element)
  return {
    moment: held.momentValue ?? Date.now(),
    ...carryMoment('hostMoment', held.momentValue),
    hostZone: held.asOfOptions?.zone,
    anchors: held.anchorOptions,
  }
}

export function asOfContextInputs(inputs: ReturnType<typeof captureAsOfLoad>): AsOfInputs {
  return {
    moment: inputs.moment,
    anchors: inputs.anchors,
    asOf: inputs.hostZone === undefined ? undefined : { zone: inputs.hostZone },
  }
}

export function dispatchAsof(element: EventTarget, day: AsOfDay): void {
  element.dispatchEvent(new CustomEvent('asof', { detail: day }))
}

export function defineAsOfPropertyAccessors(prototype: object): void {
  Object.defineProperties(prototype, {
    anchors: {
      configurable: true,
      get(this: object) {
        return state(this).anchorOptions
      },
      set(this: AsOfElementHost, value: AsOfInputs['anchors']) {
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
        parseAsOfInputs({ asOf: value })
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
        parseAsOfInputs({ moment: value })
        state(this).momentValue = value
        this.asOfInputsChanged()
      },
    },
  })
}
