import { ensureStyle } from '@segnavia/frame'
import { EDITOR_CSS } from './editor-css.ts'

export { EDITOR_CSS } from './editor-css.ts'

export function ensureEditorStyle(element: Element) {
  ensureStyle(element, 'markdown-editor', EDITOR_CSS)
}
