import type { OriginApproval } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'

export class PageElementAttributes extends HTMLElement {
  static {
    defineStylesheetPropertyAccessors(PageElementAttributes.prototype)
  }
  declare css: string
  declare cspExtra: string
  declare origins: Iterable<OriginApproval>
  private brandOptions: BrandsOptions | undefined

  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }

  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
    this.brandsChanged()
  }

  protected brandsChanged(): void {}

  get bounded(): boolean {
    return this.hasAttribute('bounded')
  }

  set bounded(value: boolean) {
    this.toggleAttribute('bounded', value)
  }

  get label(): string {
    return this.getAttribute('label') ?? ''
  }

  set label(value: string | null | undefined) {
    if (value == null || value === '') this.removeAttribute('label')
    else this.setAttribute('label', value)
  }
}
