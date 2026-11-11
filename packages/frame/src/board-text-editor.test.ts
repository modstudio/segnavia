import { describe, expect, test } from 'bun:test'
import type { SegnaviaBoard } from './board.ts'
import type { BoardTextTarget } from './board-text-editor.ts'
import { BoardTextEditor, limitedInsertion, textWithinCodePointLimit } from './board-text-editor.ts'

function target(id: string, node: HTMLElement, focusNode: HTMLElement): BoardTextTarget {
  return {
    id,
    node,
    focusNode,
    text: id,
    ariaLabel: `Edit ${id}`,
    command: (text) => ({ type: 'label-set', label: { id }, text }),
    edit: { kind: 'edit-label', ids: [id] },
  }
}

describe('board text editor keyboard entry', () => {
  test.each(['label', 'section'])('opens a selected %s when its focus node starts the event path', (id) => {
    const board = Object.assign(new EventTarget(), { selection: [id] }) as unknown as SegnaviaBoard
    const focusNode = {} as HTMLElement
    const resolved = target(id, id === 'section' ? focusNode : ({} as HTMLElement), focusNode)
    const editor = new BoardTextEditor(
      board,
      {} as HTMLElement,
      {} as never,
      (selected) => (selected === id ? resolved : undefined),
      () => {},
      () => {},
    )
    let opened: BoardTextTarget | undefined
    editor.open = (value) => {
      opened = value
    }
    const event = {
      key: 'Enter',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      composedPath: () => [focusNode],
      preventDefault() {},
    } as unknown as KeyboardEvent

    ;(editor as unknown as { onBoardKeyDown(event: KeyboardEvent): void }).onBoardKeyDown(event)

    expect(opened).toBe(resolved)
    editor.detach()
  })
})

describe('label text code point limit', () => {
  test.each([
    ['ten ASCII characters', 'abcdefghij', 'abcde'],
    ['surrogate pairs', '😀😁😂😃😄😅', '😀😁😂😃😄'],
    ['Hebrew letters and niqqud', 'אְבּגדה', 'אְבּג'],
  ])('bounds %s by Unicode code points', (_name, input, expected) => {
    expect(textWithinCodePointLimit(input, 5)).toBe(expected)
  })

  test('cuts pasted text to the remaining code points without removing text after the selection', () => {
    expect(limitedInsertion('abYZ', 2, 2, '1234567890', 5)).toBe('1')
    expect(limitedInsertion('😀Z', 0, 2, '😁😂😃😄😅😆', 5)).toBe('😁😂😃😄')
  })

  test('an unchanged over-limit editor does not resolve or commit a target', () => {
    const board = Object.assign(new EventTarget(), { selection: ['label'] }) as unknown as SegnaviaBoard
    let resolutions = 0
    const editor = new BoardTextEditor(
      board,
      {} as HTMLElement,
      {} as never,
      () => {
        resolutions += 1
        return undefined
      },
      () => {},
      () => {},
    )
    const textTarget = { ...target('label', {} as HTMLElement, {} as HTMLElement), text: 'abcdefghij', limit: 5 }

    ;(editor as unknown as { commit(active: unknown): void }).commit({
      target: textTarget,
      textarea: { value: 'abcdefghij' },
      openedText: 'abcdefghij',
      previousVisibility: '',
      growing: false,
    })

    expect(resolutions).toBe(0)
    editor.detach()
  })
})
