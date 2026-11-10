import { expect, test } from 'bun:test'
import type { Board, BoardShapes, BoardView } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import { BoardEditingInput } from './board-editing-input.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'

class TestElement {
  dataset: DOMStringMap = {} as DOMStringMap
}

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [{ id: 'a', kind: 'page', address: 'a', x: 10, y: 20, width: 100 }],
  labels: [],
  sections: [],
}
const shapes: BoardShapes = { items: { a: { width: 1, height: 1 } }, labels: {} }
const view: BoardView = { zoom: 1, pan: { x: 0, y: 0 }, viewport: { width: 800, height: 600 } }

test('pointer-move and nudge releases stay on the primitive commit path', () => {
  const previousHTMLElement = globalThis.HTMLElement
  Object.assign(globalThis, { HTMLElement: TestElement })
  try {
    let optimistic = board
    let commits = 0
    let commands = 0
    const overlay = { querySelector: () => undefined } as unknown as HTMLElement
    const bridge = {
      overlay,
      value: () => optimistic,
      view: () => view,
      shapes: () => shapes,
      local: (event: { clientX: number; clientY: number }) => ({ x: event.clientX, y: event.clientY }),
      setDropTarget() {},
    } as BoardEditingBridge
    const host = { selection: ['a'], setPointerCapture() {} } as unknown as SegnaviaBoard
    const input = new BoardEditingInput(
      host,
      { move: true, resize: true, remove: true, add: true, arrange: true },
      {
        current: () => optimistic,
        bridge: () => bridge,
        live: (value) => {
          optimistic = value
        },
        commit: (_before, after) => {
          commits += 1
          optimistic = after
        },
        command: () => {
          commands += 1
        },
        remove() {},
        undo() {},
        redo() {},
      },
    )
    const node = new TestElement()
    node.dataset.boardItem = 'a'
    const pointer = (clientX: number) =>
      ({
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX,
        clientY: 0,
        shiftKey: false,
        composedPath: () => [node],
        preventDefault() {},
      }) as unknown as PointerEvent

    expect(input.pointerDown(pointer(0))).toBe(true)
    expect(input.pointerMove(pointer(20))).toBe(true)
    expect(input.pointerUp(pointer(20))).toBe(true)
    expect(
      input.keyDown({
        key: 'ArrowRight',
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        composedPath: () => [],
        preventDefault() {},
      } as unknown as KeyboardEvent),
    ).toBe(true)
    expect({ commits, commands }).toEqual({ commits: 2, commands: 0 })
  } finally {
    Object.assign(globalThis, { HTMLElement: previousHTMLElement })
  }
})

test('unbuildable resize releases restore the board before the live preview', () => {
  const previousHTMLElement = globalThis.HTMLElement
  Object.assign(globalThis, { HTMLElement: TestElement })
  try {
    const labelBoard: Board = { ...board, items: [], labels: [{ id: 'a', text: 'Label', x: 10, y: 20 }] }
    const cases = [
      {
        before: board,
        shapes,
        node: Object.assign(new TestElement(), { dataset: { resizeHandle: '', corner: 'bottom-right' } }),
        discardRelease: (value: Board): Board => ({ ...value, items: [] }),
      },
      {
        before: labelBoard,
        shapes: { items: {}, labels: { a: { width: 50, height: 20 } } },
        node: Object.assign(new TestElement(), { dataset: { labelResizeHandle: 'a' } }),
        discardRelease: (value: Board): Board => ({ ...value, labels: value.labels.map(({ width: _width, ...label }) => label) }),
      },
    ]

    for (const fixture of cases) {
      let optimistic = fixture.before
      let commands = 0
      const overlay = { querySelector: () => undefined } as unknown as HTMLElement
      const bridge = {
        overlay,
        value: () => optimistic,
        view: () => view,
        shapes: () => fixture.shapes,
        local: (event: { clientX: number; clientY: number }) => ({ x: event.clientX, y: event.clientY }),
        setDropTarget() {},
      } as BoardEditingBridge
      const host = { selection: ['a'], setPointerCapture() {} } as unknown as SegnaviaBoard
      const input = new BoardEditingInput(
        host,
        { move: true, resize: true, remove: true, add: true, arrange: true },
        {
          current: () => fixture.before,
          bridge: () => bridge,
          live: (value) => {
            optimistic = value
          },
          commit() {},
          command: () => {
            commands += 1
          },
          remove() {},
          undo() {},
          redo() {},
        },
      )
      const pointer = (clientX: number) =>
        ({
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          clientX,
          clientY: 20,
          shiftKey: false,
          composedPath: () => [fixture.node],
          preventDefault() {},
        }) as unknown as PointerEvent

      expect(input.pointerDown(pointer(0))).toBe(true)
      expect(input.pointerMove(pointer(20))).toBe(true)
      optimistic = fixture.discardRelease(optimistic)
      expect(input.pointerUp(pointer(20))).toBe(true)
      expect(optimistic).toEqual(fixture.before)
      expect(commands).toBe(0)
    }
  } finally {
    Object.assign(globalThis, { HTMLElement: previousHTMLElement })
  }
})
