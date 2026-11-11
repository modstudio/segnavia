import { expect, test } from 'bun:test'
import { type OriginApproval, Page, Print } from '@segnavia/format'
import { frameDocument } from './bridge.ts'
import { internalPageLoad } from './document-value-load.ts'

test('a thumbnail page frame carries approved image origins in its CSP', async () => {
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const originalElements = Object.getOwnPropertyDescriptor(globalThis, 'customElements')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const definitions = new Map<string, CustomElementConstructor>()
  let srcdoc = ''
  const attributes = new Set<string>()
  const pageElement = {
    part: { add() {} },
    style: {} as CSSStyleDeclaration,
    origins: [] as Iterable<OriginApproval>,
    toggleAttribute(name: string, force?: boolean) {
      if (force ?? !attributes.has(name)) attributes.add(name)
      else attributes.delete(name)
    },
    [internalPageLoad](page: Page) {
      const html = 'html' in page.body ? page.body.html : ''
      srcdoc = frameDocument(html, { scripts: 'refuse', nonce: 'test', origins: this.origins })
    },
  }
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class HTMLElement extends EventTarget {} })
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: { define: (name: string, value: CustomElementConstructor) => definitions.set(name, value), get: (name: string) => definitions.get(name) },
  })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => pageElement } })
  try {
    const { mountThumbnailPage } = await import('./thumbnail-page.ts')
    const source = Page.parse({ html: '<img src="https://images.example/a.png">', print: { paper: 'letter' } })
    const print = Print.parse({ paper: 'letter' })
    const viewport = { firstElementChild: null, append() {} } as unknown as HTMLElement
    mountThumbnailPage(viewport, source, print, {
      css: '',
      origins: [{ origin: 'https://images.example', kinds: ['image'] }],
    })
    expect(srcdoc).toMatch(/img-src [^;]*https:\/\/images\.example/)
    expect(attributes.has('bounded')).toBe(true)
  } finally {
    if (originalElement) Object.defineProperty(globalThis, 'HTMLElement', originalElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
    if (originalElements) Object.defineProperty(globalThis, 'customElements', originalElements)
    else Reflect.deleteProperty(globalThis, 'customElements')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
