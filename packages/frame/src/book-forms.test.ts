import { expect, test } from 'bun:test'
import { SegnaviaBook } from './book.ts'

test('a book frame leaves forms out when the host refuses them', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const attributes = new Map<string, string>()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        dataset: {},
        setAttribute(name: string, value: string) {
          attributes.set(name, value)
        },
      }),
    },
  })
  try {
    const book = new SegnaviaBook()
    book.forms = 'refuse'
    ;(book as unknown as { mountFrame(rendered: { title: string; srcdoc: string; policy: string; scripts: 'sandboxed' }): void }).mountFrame({
      title: 'Book',
      srcdoc: '<p>Book</p>',
      policy: "form-action 'none'",
      scripts: 'sandboxed',
    })
    expect(attributes.get('sandbox')).toBe('allow-scripts')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
