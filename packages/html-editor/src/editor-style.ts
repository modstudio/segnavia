import { ensureStyle } from '@segnavia/frame/base-style'
import { EDITOR_CSS } from './editor-css.ts'

export function ensureEditorStyle(element: Element): void {
  ensureStyle(element, 'html-editor', EDITOR_CSS)
}
