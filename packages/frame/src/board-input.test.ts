import { afterEach, expect, test } from 'bun:test'
import { BoardPointerInput } from './board-input.ts'

class TestElement extends EventTarget {
  dataset: DOMStringMap = {} as DOMStringMap
}

const previousHTMLElement = globalThis.HTMLElement
const previousHTMLButtonElement = globalThis.HTMLButtonElement

afterEach(() => {
  Object.assign(globalThis, { HTMLElement: previousHTMLElement, HTMLButtonElement: previousHTMLButtonElement })
})

test('Space selects labels and section titles before editing input and Escape clears them', () => {
  Object.assign(globalThis, { HTMLElement: TestElement, HTMLButtonElement: TestElement })
  const host = new TestElement()
  const selected: Array<[string | null, boolean]> = []
  let delegated = 0
  const gestures = {
    onWheel() {},
    onPointerDown() {},
    onPointerMove() {},
    onPointerEnd() {},
    get dragged() {
      return false
    },
  }
  const input = new BoardPointerInput(host as unknown as HTMLElement, gestures as never, {
    item: () => undefined,
    itemAt: () => undefined,
    select: (id, toggle) => selected.push([id, toggle]),
    selectAll() {},
    open() {},
    boardKey() {},
    action() {},
    focus() {},
    focusByTab: () => false,
  })
  input.delegate = {
    pointerDown: () => false,
    pointerMove: () => false,
    pointerUp: () => false,
    pointerCancel: () => false,
    keyDown: () => {
      delegated += 1
      return true
    },
  }
  input.connect()
  const label = Object.assign(new TestElement(), { dataset: { boardLabel: 'label' } })
  const section = Object.assign(new TestElement(), { dataset: { boardSectionTitle: 'section' } })
  for (const [key, node, shiftKey] of [
    [' ', label, true],
    [' ', section, false],
    ['Escape', label, false],
  ] as const) {
    const event = new Event('keydown', { cancelable: true }) as KeyboardEvent
    Object.assign(event, { key, shiftKey, composedPath: () => [node, host] })
    host.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  expect(selected).toEqual([
    ['label', true],
    ['section', false],
    [null, false],
  ])
  expect(delegated).toBe(0)
  input.disconnect()
})
