import { cleanHtml, type HtmlProfile } from '@segnavia/html'
import { Editor, type EditorOptions } from '@tiptap/core'

export class HtmlProfileEditor extends Editor {
  private profileValue?: HtmlProfile

  constructor(profile: HtmlProfile, options: Partial<EditorOptions>) {
    super(options)
    this.profileValue = profile
  }

  override getHTML(): string {
    const html = super.getHTML()
    return this.profileValue ? cleanHtml(html, this.profileValue).html : html
  }
}

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
