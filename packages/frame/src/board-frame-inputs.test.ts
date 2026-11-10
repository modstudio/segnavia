import { expect, test } from 'bun:test'
import type { Board, OriginApproval } from '@segnavia/format'
import type { BoardFrameInputs } from './board-frame-inputs.ts'

test('rebuilds frame inputs when origins change and clears them with undefined', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  try {
    const { BoardFrameInputsElement } = await import('./board-frame-inputs.ts')
    class TestFrameInputsElement extends BoardFrameInputsElement {
      changes: BoardFrameInputs[] = []

      get inputs(): BoardFrameInputs {
        return this.frameInputs
      }

      get selection(): readonly string[] {
        return []
      }

      set selection(_value: readonly string[]) {}

      protected acceptBoardInput(_board: Board | null): void {}

      protected frameInputsChanged(): void {
        this.changes.push(this.frameInputs)
      }
    }

    const element = new TestFrameInputsElement()
    const initial = element.inputs
    const approvals: OriginApproval[] = [{ origin: 'https://images.example', kinds: ['image'] }]
    element.origins = approvals

    expect(element.inputs).not.toBe(initial)
    expect(element.changes).toEqual([element.inputs])
    expect(element.origins).toEqual(approvals)
    expect(element.origins).not.toBe(approvals)

    approvals.push({ origin: 'https://fonts.example', kinds: ['font'] })
    expect(element.origins).toEqual([{ origin: 'https://images.example', kinds: ['image'] }])

    element.origins = undefined
    expect(element.origins).toEqual([])
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
