import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'
import { defineEditionPropertyAccessor } from './edition-property.ts'
import { dispatchElementError } from './element-error.ts'

export abstract class DocumentAsOfElement extends HTMLElement implements AsOfElementProperties {
  static observedAttributes = ['edition']
  static {
    defineAsOfPropertyAccessors(DocumentAsOfElement.prototype)
    defineEditionPropertyAccessor(DocumentAsOfElement.prototype)
  }
  declare edition: string | undefined
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']

  attributeChangedCallback(name: string): void {
    if (name !== 'edition') return
    try {
      this.reloadEdition()
    } catch (error) {
      dispatchElementError(this, error)
    }
  }

  protected abstract asOfInputsChanged(): void
  protected abstract reloadEdition(): void
}
