import { defineElementPropertyAccessors } from './element-property-accessors.ts'

export class PageElementAttributes extends HTMLElement {
  static {
    defineElementPropertyAccessors(PageElementAttributes.prototype, () => ({ css: '', cspExtra: '', dependencyOrigins: [] as Iterable<string> }))
  }
  declare css: string
  declare cspExtra: string
  declare dependencyOrigins: Iterable<string>

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
