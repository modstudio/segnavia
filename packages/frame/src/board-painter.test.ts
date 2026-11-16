import { expect, test } from 'bun:test'
import type { BoardItem } from '@segnavia/format'
import type { BoardFrameInputs } from './board-frame-inputs.ts'

test('repaints a mounted item when its frame inputs value changes', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  class TestElement extends EventTarget {
    children: TestElement[] = []
    className = ''
    dataset: Record<string, string> = {}
    dir = ''
    textContent = ''
    parts = new Set<string>()
    part = {
      add: (...values: string[]) =>
        values.forEach((value) => {
          this.parts.add(value)
        }),
    }
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

    removeAttribute(name: string) {
      if (name === 'data-board-item-state') delete this.dataset.boardItemState
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
    painter.paint(node as unknown as HTMLElement, item, { status: 'pending' }, 'cover', () => {}, first)
    const original = node.children[0]
    painter.paint(node as unknown as HTMLElement, item, { status: 'pending' }, 'cover', () => {}, first)
    expect(node.replacements).toBe(1)
    expect(node.children[0]).toBe(original)

    const changed: BoardFrameInputs = { origins: [{ origin: 'https://images.example', kinds: ['image'] }] }
    painter.paint(node as unknown as HTMLElement, item, { status: 'pending' }, 'cover', () => {}, changed)
    expect(node.replacements).toBe(2)
    expect(node.children[0]).not.toBe(original)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('paints unavailable items as labeled placeholders with their state', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  class TestElement extends EventTarget {
    children: TestElement[] = []
    dataset: Record<string, string> = {}
    dir = ''
    textContent = ''
    parts = new Set<string>()
    part = {
      add: (...values: string[]) =>
        values.forEach((value) => {
          this.parts.add(value)
        }),
    }
    get childElementCount() {
      return this.children.length
    }
    append(...children: TestElement[]) {
      this.children.push(...children)
    }
    replaceChildren(...children: TestElement[]) {
      this.children = children
    }
    removeAttribute(name: string) {
      if (name === 'data-board-item-state') delete this.dataset.boardItemState
    }
  }
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new TestElement() } })
  try {
    const { BoardPainter } = await import('./board-painter.ts')
    const painter = new BoardPainter()
    const node = new TestElement()
    const item = { id: 'one' } as BoardItem
    painter.paint(
      node as unknown as HTMLElement,
      item,
      { status: 'unavailable', value: { kind: 'page', state: 'withheld', label: 'Restricted' } },
      'cover',
      () => {},
      { origins: [] },
    )
    const placeholder = node.children[0]
    const label = placeholder?.children[0]
    expect(placeholder?.parts).toContain('placeholder')
    expect(label?.parts).toContain('placeholder-label')
    expect(label?.textContent).toBe('Restricted')
    expect(label?.dir).toBe('auto')
    expect(node.dataset.boardItemState).toBe('withheld')

    const fallback = new TestElement()
    painter.paint(
      fallback as unknown as HTMLElement,
      { id: 'two' } as BoardItem,
      { status: 'unavailable', value: { kind: 'paper', state: 'gone' } },
      'cover',
      () => {},
      { origins: [] },
    )
    expect(fallback.children[0]?.children[0]?.textContent).toBe('paper')
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
