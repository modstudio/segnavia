import { expect, test } from 'bun:test'
import type { BoardItem, Sound } from '@segnavia/format'

class TestElement extends EventTarget {
  children: TestElement[] = []
  className = ''
  dataset: Record<string, string> = {}
  part = {
    add: (...values: string[]) =>
      values.forEach((value) => {
        this.parts.add(value)
      }),
  }
  parts = new Set<string>()
  style: Record<string, string> = {}
  type = ''

  get childElementCount() {
    return this.children.length
  }

  append(...children: TestElement[]) {
    this.children.push(...children)
  }

  replaceChildren(...children: TestElement[]) {
    this.children = children
  }

  removeAttribute() {}

  click() {
    this.dispatchEvent(new Event('click'))
  }
}

const mountCover = () => {
  const element = new TestElement()
  element.parts.add('sound-face')
  return { element: element as unknown as HTMLElement, dispose() {} }
}

async function withPainter(run: (painter: import('./board-painter.ts').BoardPainter) => void): Promise<void> {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new TestElement() } })
  try {
    const { BoardPainter } = await import('./board-painter.ts')
    run(new BoardPainter(mountCover))
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
}

const item = { id: 'sound', kind: 'sound' } as BoardItem
const sound: Sound = { format: 'mp3', durationMs: 1_000 }
const outcome = { status: 'resolved' as const, value: { kind: 'sound' as const, sound, src: 'theme.mp3' } }

test('cover-tier board sound mounts its face behind a shield', async () => {
  const node = new TestElement()
  await withPainter((painter) => painter.paint(node as unknown as HTMLElement, item, outcome, 'cover', () => {}, { origins: [] }, '0'))
  expect(node.children[0]?.parts).toContain('sound-face')
  expect(node.children[1]?.className).toBe('shield')
})

test('live-tier board sound raises one bounded sound event and has no shield', async () => {
  const node = new TestElement()
  await withPainter((painter) => painter.paint(node as unknown as HTMLElement, item, outcome, 'live', () => {}, { origins: [] }, '0'))
  const button = node.children[0]
  expect(node.children).toHaveLength(1)
  expect(button?.type).toBe('button')
  const events: CustomEvent[] = []
  button?.addEventListener('segnavia-sound-play', (event) => events.push(event as CustomEvent))
  button?.click()
  expect(events).toHaveLength(1)
  expect(events[0]?.detail).toEqual({ sound, src: 'theme.mp3', placement: '0' })
  expect(events[0]).toMatchObject({ bubbles: true, composed: true, cancelable: true })
})
