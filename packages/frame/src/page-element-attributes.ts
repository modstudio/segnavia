export class PageElementAttributes extends HTMLElement {
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
