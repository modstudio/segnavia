import { expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import type { BoardFrameInputs } from './board-frame-inputs.ts'

test('repaints a mounted item when its frame inputs value changes', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  class TestElement extends EventTarget {
    children: TestElement[] = []
    className = ''
    part = { add() {} }
    replacements = 0

    get childElementCount() {
      return this.children.length
    }

    append(...children: TestElement[]) {
      this.children.push(...children)
    }

    replaceChildren(...children: TestElement[]) {
      this.replacements++
      this.children = children
    }
  }
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new TestElement() } })
  try {
    const { BoardPainter } = await import('./board-painter.ts')
    const painter = new BoardPainter()
    const node = new TestElement()
    const item = { id: 'one' } as BoardItem
    const first: BoardFrameInputs = { origins: [] }
    painter.paint(node as unknown as HTMLElement, item, undefined, 'cover', () => {}, first)
    const original = node.children[0]
    painter.paint(node as unknown as HTMLElement, item, undefined, 'cover', () => {}, first)
    expect(node.replacements).toBe(1)
    expect(node.children[0]).toBe(original)

    const changed: BoardFrameInputs = { origins: [{ origin: 'https://images.example', kinds: ['image'] }] }
    painter.paint(node as unknown as HTMLElement, item, undefined, 'cover', () => {}, changed)
    expect(node.replacements).toBe(2)
    expect(node.children[0]).not.toBe(original)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
