import { Window } from 'happy-dom'

const windowValue = new Window({ url: 'https://example.test/' })
if (!('part' in windowValue.Element.prototype)) {
  Object.defineProperty(windowValue.Element.prototype, 'part', {
    configurable: true,
    get(this: Element) {
      return {
        add: (...tokens: string[]) => this.setAttribute('part', [...new Set([...(this.getAttribute('part')?.split(/\s+/) ?? []), ...tokens])].join(' ')),
      }
    },
  })
}
const globalValue = globalThis as unknown as Record<string, unknown>
const names = [
  'window',
  'document',
  'navigator',
  'customElements',
  'Node',
  'Element',
  'HTMLElement',
  'ShadowRoot',
  'Document',
  'Text',
  'DocumentFragment',
  'Range',
  'Selection',
  'DOMRect',
  'DOMParser',
  'MutationObserver',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'InputEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const

for (const name of names) {
  const value = name === 'window' ? windowValue : windowValue[name]
  Object.defineProperty(globalValue, name, { configurable: true, value })
}
