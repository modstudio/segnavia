interface StageFitHost extends HTMLElement {
  fit: 'box' | 'viewport'
}

export function defineStageFitProperty(prototype: StageFitHost): void {
  Object.defineProperty(prototype, 'fit', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('fit') === 'viewport' ? 'viewport' : 'box'
    },
    set(this: HTMLElement, value: 'box' | 'viewport') {
      if (value === 'viewport') this.setAttribute('fit', value)
      else this.removeAttribute('fit')
    },
  })
}
