import type { Editor } from '@tiptap/core'

const editors = new WeakMap<HTMLElement, Editor>()

export function attachHtmlEditor(element: HTMLElement, editor: Editor): void {
  editors.set(element, editor)
}

export function detachHtmlEditor(element: HTMLElement): void {
  editors.delete(element)
}

export const htmlEditorTestSeam = {
  editor(element: HTMLElement): Editor {
    const editor = editors.get(element)
    if (!editor) throw new Error('The HTML editor element is not connected.')
    return editor
  },
  setContent(editor: Editor, html: string): boolean {
    return editor.commands.setContent(html, { emitUpdate: false })
  },
}
