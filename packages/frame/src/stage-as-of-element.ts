import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'

export abstract class StageAsOfElement extends HTMLElement {
  static {
    defineAsOfPropertyAccessors(StageAsOfElement.prototype)
  }
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']

  protected abstract asOfInputsChanged(): void
}
