import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'
import { PageElementAttributes } from './page-element-attributes.ts'

export abstract class PageAsOfElement extends PageElementAttributes implements AsOfElementProperties {
  static {
    defineAsOfPropertyAccessors(PageAsOfElement.prototype)
  }
  declare anchors: AsOfElementProperties['anchors']
  declare asOf: AsOfElementProperties['asOf']
  declare moment: AsOfElementProperties['moment']

  protected abstract asOfInputsChanged(): void
}
