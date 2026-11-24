import type { HtmlEditorCommands } from './html-editor-policy.ts'

export class HtmlEditorStateEmitter {
  private key = ''
  constructor(private readonly dispatch: (commands: HtmlEditorCommands) => void) {}
  emit(commands: HtmlEditorCommands): void {
    const key = JSON.stringify(commands)
    if (key === this.key) return
    this.key = key
    this.dispatch(commands)
  }
}
