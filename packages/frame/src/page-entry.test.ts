import { afterAll, expect, test } from 'bun:test'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'

const definitions = new Map<string, CustomElementConstructor>()
const previousGlobals = new Map(
  ['HTMLElement', 'customElements', 'ResizeObserver'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const),
)

afterAll(() => {
  for (const [name, previous] of previousGlobals) {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else Reflect.deleteProperty(globalThis, name)
  }
})

class TestElement extends EventTarget {}

function installGlobals() {
  definitions.clear()
  const globals = {
    HTMLElement: TestElement,
    ResizeObserver: class ResizeObserver {
      observe() {}
      disconnect() {}
    },
    customElements: {
      define(name: string, element: CustomElementConstructor) {
        definitions.set(name, element)
      },
      get(name: string) {
        return definitions.get(name)
      },
    },
  }
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

test('the page entry defines only the page element and tolerates a second load', async () => {
  installGlobals()
  const page = await import('./page-entry.ts')

  expect(definitions.get(HEADLESS_ELEMENTS.page)).toBe(page.SegnaviaPage)
  expect(new Set(definitions.keys())).toEqual(new Set([HEADLESS_ELEMENTS.page]))
  await expect(import('./page-entry.ts')).resolves.toBe(page)
})
