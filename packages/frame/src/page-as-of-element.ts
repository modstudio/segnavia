import type { AnchorSource, Zone } from '@segnavia/format'
import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'
import { PageElementAttributes } from './page-element-attributes.ts'

export abstract class PageAsOfElement extends PageElementAttributes implements AsOfElementProperties {
  static {
    defineAsOfPropertyAccessors(PageAsOfElement.prototype)
  }
  protected anchorOptions: AnchorSource | undefined
  protected asOfOptions: { zone?: Zone } | undefined
  protected momentValue: number | undefined

  declare anchors: AnchorSource | undefined
  declare asOf: { zone?: Zone } | undefined
  declare moment: number | undefined

  protected abstract asOfInputsChanged(): void
}
