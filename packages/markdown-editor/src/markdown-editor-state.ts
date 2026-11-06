import { redoDepth, undoDepth } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import type { Editor } from '@tiptap/core'
import type { MarkdownEditorMode } from './markdown-editor-policy.ts'
import type { MarkdownEditorStateDetail } from './markdown-editor-types.ts'
import { richEditorState } from './markdown-rich-commands.ts'

export class MarkdownEditorStateEmitter {
  private key = ''

  constructor(private readonly dispatch: (state: MarkdownEditorStateDetail) => void) {}

  source(view: EditorView | null, canUndo = view ? undoDepth(view.state) > 0 : false, canRedo = view ? redoDepth(view.state) > 0 : false) {
    this.emit({ marks: [], nodes: [], canUndo, canRedo })
  }

  visible(mode: MarkdownEditorMode, richView: Editor | null, sourceView: EditorView | null) {
    if (mode === 'rich' && richView) this.emit(richEditorState(richView))
    else this.source(sourceView)
  }

  emit(state: MarkdownEditorStateDetail) {
    const key = JSON.stringify(state)
    if (key === this.key) return
    this.key = key
    this.dispatch(state)
  }
}
