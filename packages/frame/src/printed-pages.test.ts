import { expect, test } from 'bun:test'

class TestElement extends EventTarget {
  private readonly attributes = new Map<string, string>()
  querySelector() {
    return null
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
  append() {}
}

const input = {
  type: 'document' as const,
  kind: 'page' as const,
  conditions: [{ type: 'condition' as const, name: 'teacher' }],
  editions: [
    { type: 'edition' as const, name: 'student', conditions: [] },
    { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
  ],
  defaultEdition: 'student',
  children: [{ type: 'page' as const, body: { html: '<p>Question<span data-segnavia-condition="teacher"> Answer</span></p>' } }],
}

test('an edition refusal discards a loaded printed-pages document and its scheduled reload', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  })
  const { SegnaviaPrintedPages } = await import('./printed-pages.ts')
  if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
  if (previousResizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', previousResizeObserver)
  else Reflect.deleteProperty(globalThis, 'ResizeObserver')

  const failures: Error[] = []
  const failure = { setAttribute() {}, dir: '', textContent: '' }
  const element = Object.create(SegnaviaPrintedPages.prototype) as InstanceType<typeof SegnaviaPrintedPages>
  let scheduled = true
  Object.assign(element, {
    generation: 0,
    querySelector: () => failure,
    setAttribute() {},
    dispatchEvent: (event: ErrorEvent) => {
      failures.push(event.error)
      return true
    },
    reloads: {
      cancel: () => (scheduled = false),
      schedule: () => (scheduled = true),
    },
  })
  Object.defineProperty(element, 'edition', { configurable: true, writable: true, value: 'student' })
  element.document = input
  element.edition = 'missing'

  element.attributeChangedCallback('edition')

  expect(element.document).toBeNull()
  expect(Reflect.get(element, 'editionDocument')).toBeNull()
  expect(scheduled).toBeFalse()
  expect(Reflect.get(element, 'generation')).toBe(1)
  expect(failures.at(-1)?.message).toContain('requested edition "missing" is unknown')
})
