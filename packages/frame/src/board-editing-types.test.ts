import { expect, test } from 'bun:test'
import { boardEditorFlags } from './board-editing-types.ts'

test('label resizing requires both resize and labelResize', () => {
  expect(boardEditorFlags().labelResize).toBe(true)
  expect(boardEditorFlags({ resize: false }).labelResize).toBe(false)
  expect(boardEditorFlags({ labelResize: false }).labelResize).toBe(false)
  expect(boardEditorFlags({ resize: false, labelResize: true }).labelResize).toBe(false)
})
