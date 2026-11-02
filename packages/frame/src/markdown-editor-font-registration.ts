import type { FontReference } from '@segnavia/format'
import { registerMarkdownEditorFonts } from './markdown-editor-fonts.ts'
import type { FontsOptions } from './page-fonts.ts'

export class MarkdownEditorFontRegistration {
  private loadController: AbortController | undefined
  private remove: (() => void) | undefined

  constructor(private readonly element: HTMLElement) {}

  clear() {
    this.loadController?.abort()
    this.loadController = undefined
    this.remove?.()
    this.remove = undefined
  }

  load(references: FontReference[], fonts: FontsOptions | undefined) {
    this.clear()
    if (!this.element.isConnected || references.length === 0) return
    const controller = new AbortController()
    this.loadController = controller
    void registerMarkdownEditorFonts(this.element, references, fonts, controller.signal)
      .then((remove) => {
        if (!controller.signal.aborted) this.remove = remove
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          this.element.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
      })
  }
}
