import { describe, expect, test } from 'bun:test'
import type { Board } from '@segnavia/format'
import type { SegnaviaBoard } from './board.ts'
import type { BoardEditingBridge } from './board-editing-seam.ts'
import { boardEditorFlags } from './board-editing-types.ts'
import { BoardTextEditing, boardTextTarget, labelEditRefusal, labelTextTarget, sectionTitleTarget } from './board-text-editing.ts'
import type { BoardTextTarget } from './board-text-editor.ts'

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
    const label = board.labels[0]
    const section = board.sections[0]
    if (!label || !section) throw new Error('The fixture requires one label and section.')
    const focusNode = {} as HTMLElement
    const labelTarget = labelTextTarget(label, node, focusNode, 'Edit label', 5)
    const sectionTarget = sectionTitleTarget(section, node, 'Edit section title')
    expect(labelTarget).toMatchObject({
      id: 'label',
      text: 'עברית',
      focusNode,
      ariaLabel: 'Edit label',
      edit: { kind: 'edit-label', ids: ['label'] },
      limit: 5,
    })
    expect(labelTarget.command('חדש')).toEqual({ type: 'label-set', label: { id: 'label' }, text: 'חדש' })
    expect(sectionTarget).toMatchObject({
      id: 'section',
      text: 'כותרת',
      focusNode: node,
      ariaLabel: 'Edit section title',
      edit: { kind: 'rename-section', ids: ['section'] },
    })
    expect(sectionTarget.limit).toBeUndefined()
    expect(sectionTarget.command('חדשה')).toEqual({ type: 'section-set', section: { id: 'section' }, title: 'חדשה' })
  })

  test('returns the exact editLabel refusals', () => {
    expect(labelEditRefusal(board, 'missing', true)).toBe('label id missing does not exist; pass the id of a label on the board')
    expect(labelEditRefusal(board, 'label', false)).toBe('label text editing is switched off; set editors.labelText to true')
    expect(labelEditRefusal(board, 'label', true)).toBeUndefined()
  })

  test('editor flags remove label and section targets from every keyboard path', () => {
    const node = {} as HTMLElement
    const focusNode = {} as HTMLElement
    const nodes = { focusNode: () => focusNode, labelTextNode: () => node, sectionTitleNode: () => node }
    const labels = { labelEdit: 'Edit label', sectionTitleEdit: 'Edit section title' }
    expect(boardTextTarget(board, 'label', boardEditorFlags({ labelText: false }), nodes, labels)).toBeUndefined()
    expect(boardTextTarget(board, 'section', boardEditorFlags({ sectionTitle: false }), nodes, labels)).toBeUndefined()
    expect(boardTextTarget(board, 'label', boardEditorFlags({ sectionTitle: false }), nodes, labels, 5)).toMatchObject({
      edit: { kind: 'edit-label' },
      limit: 5,
    })
    const section = boardTextTarget(board, 'section', boardEditorFlags({ labelText: false }), nodes, labels, 5)
    expect(section?.edit.kind).toBe('rename-section')
    expect(section?.limit).toBeUndefined()
  })

  test('editLabel opens a rendered label through the shared target resolver', () => {
    const host = Object.assign(new EventTarget(), { labels: {}, selection: [] }) as unknown as SegnaviaBoard
    const node = {} as HTMLElement
    const focusNode = {} as HTMLElement
    const bridge = {
      overlay: {},
      value: () => board,
      focusNode: () => focusNode,
      labelTextNode: () => node,
      sectionTitleNode: () => undefined,
    } as unknown as BoardEditingBridge
    const editing = new BoardTextEditing(
      host,
      bridge,
      boardEditorFlags(),
      { labelTextChars: 5 },
      () => {},
      () => {},
    )
    let opened: BoardTextTarget | undefined
    ;(editing as unknown as { editor: { open(target: BoardTextTarget): void } }).editor.open = (target) => {
      opened = target
    }

    expect(editing.editLabel('label')).toEqual({ ok: true })
    expect(opened).toMatchObject({ id: 'label', node, focusNode, ariaLabel: 'Edit label', limit: 5 })
    editing.detach()
  })

  test('editLabel distinguishes an existing label whose editor node is not rendered', () => {
    const host = Object.assign(new EventTarget(), { labels: {}, selection: [] }) as unknown as SegnaviaBoard
    const bridge = {
      overlay: {},
      value: () => board,
      focusNode: () => undefined,
      labelTextNode: () => undefined,
      sectionTitleNode: () => undefined,
    } as unknown as BoardEditingBridge
    const editing = new BoardTextEditing(
      host,
      bridge,
      boardEditorFlags(),
      undefined,
      () => {},
      () => {},
    )

    expect(editing.editLabel('label')).toEqual({
      ok: false,
      refusal: 'label id label is not rendered yet; call editLabel again after the board renders it',
    })
    editing.detach()
  })
})
