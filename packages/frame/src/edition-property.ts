export interface EditionElement extends HTMLElement {
  edition: string | undefined
}

export function editionAttribute(element: HTMLElement): string | undefined {
  return element.getAttribute?.('edition') ?? undefined
}

export function defineEditionPropertyAccessor(prototype: object): void {
  Object.defineProperty(prototype, 'edition', {
    configurable: true,
    get(this: HTMLElement) {
      return editionAttribute(this)
    },
    set(this: HTMLElement, value: string | undefined) {
      if (value === undefined) this.removeAttribute('edition')
      else this.setAttribute('edition', value)
    },
  })
}
