import { type MarkdownEditorModel, setModelTitle } from './markdown-editor-model.ts'
import { markdownEditorKeyAction } from './markdown-editor-policy.ts'
import { normalizeMarkdownTitle } from './markdown-title.ts'

type TitleInputOptions = {
  field: HTMLInputElement
  model: () => MarkdownEditorModel
  update: (model: MarkdownEditorModel) => void
  emit: (name: 'segnavia-markdown-change' | 'segnavia-save' | 'segnavia-title-change', detail?: unknown) => void
  toggleMode: () => void
}

export class MarkdownEditorTitleInput {
  constructor(private readonly options: TitleInputOptions) {}

  connect() {
    const { field } = this.options
    field.addEventListener('input', this.input)
    field.addEventListener('keydown', this.keyDown)
    field.addEventListener('paste', this.paste)
  }

  disconnect() {
    const { field } = this.options
    field.removeEventListener('input', this.input)
    field.removeEventListener('keydown', this.keyDown)
    field.removeEventListener('paste', this.paste)
  }

  private input = () => {
    const { field } = this.options
    const normalized = normalizeMarkdownTitle(field.value)
    field.value = normalized
    const model = setModelTitle(this.options.model(), normalized)
    if (model === this.options.model()) return
    this.options.update(model)
    this.options.emit('segnavia-title-change', { title: normalized })
    if (model.titleSource === 'leading-heading') this.options.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault()
    const action = markdownEditorKeyAction(event)
    if (!action) return
    event.preventDefault()
    if (action === 'save') this.options.emit('segnavia-save')
    else this.options.toggleMode()
  }

  private paste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData('text')
    if (pasted === undefined) return
    event.preventDefault()
    const { field } = this.options
    field.setRangeText(normalizeMarkdownTitle(pasted), field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end')
    this.input()
  }
}
