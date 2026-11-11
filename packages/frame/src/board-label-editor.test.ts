import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import { limitedInsertion, textWithinCodePointLimit } from './board-label-editor.ts'
import { labelEditRefusal, labelTextTarget, sectionTitleTarget } from './board-text-editing.ts'

const board: Board = {
  title: 'Board',
  direction: 'ltr',
  items: [],
  labels: [{ id: 'label', text: 'עברית', x: 0, y: 0 }],
  sections: [{ id: 'section', title: 'כותרת', rectangle: { x: 0, y: 0, width: 100, height: 100 }, layout: 'manual', items: [] }],
}

describe('board text editor targets', () => {
  test('maps label text and section titles to their commands and edit kinds', () => {
    const node = {} as HTMLElement
    const label = labelTextTarget(board.labels[0]!, node, 5)
    const section = sectionTitleTarget(board.sections[0]!, node)
    expect(label).toMatchObject({ id: 'label', text: 'עברית', edit: { kind: 'edit-label', ids: ['label'] }, limit: 5 })
    expect(label.command('חדש')).toEqual({ type: 'label-set', label: { id: 'label' }, text: 'חדש' })
    expect(section).toMatchObject({ id: 'section', text: 'כותרת', edit: { kind: 'rename-section', ids: ['section'] } })
    expect(section.command('חדשה')).toEqual({ type: 'section-set', section: { id: 'section' }, title: 'חדשה' })
  })

  test('returns the exact editLabel refusals', () => {
    expect(labelEditRefusal(board, 'missing', true)).toBe('label id missing does not exist; pass the id of a label on the board')
    expect(labelEditRefusal(board, 'label', false)).toBe('label text editing is switched off; set editors.labelText to true')
    expect(labelEditRefusal(board, 'label', true)).toBeUndefined()
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
})
