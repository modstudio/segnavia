import type { AnchorSource, Zone } from '@segnavia/format'
import { type AsOfElementProperties, defineAsOfPropertyAccessors } from './as-of-element.ts'

export abstract class DocumentAsOfElement extends HTMLElement implements AsOfElementProperties {
  static {
    defineAsOfPropertyAccessors(DocumentAsOfElement.prototype)
  }
  protected anchorOptions: AnchorSource | undefined
  protected asOfOptions: { zone?: Zone } | undefined
  protected momentValue: number | undefined
  protected loadMoment = 0

  declare anchors: AnchorSource | undefined
  declare asOf: { zone?: Zone } | undefined
  declare moment: number | undefined

  protected abstract asOfInputsChanged(): void
}
