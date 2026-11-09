import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'

export abstract class DocumentAsOfElement extends HTMLElement implements AsOfElementProperties {
  static {
    defineAsOfPropertyAccessors(DocumentAsOfElement.prototype)
  }
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']

  protected abstract asOfInputsChanged(): void
}
