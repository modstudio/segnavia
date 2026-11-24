import { EDITOR_CSS } from './editor-css.ts'

export function ensureEditorStyle(element: Element): void {
  const root = element.getRootNode()
  const target = root instanceof ShadowRoot ? root : document.head
  const attribute = 'data-segnavia-html-editor'
  if (target.querySelector(`style[${attribute}]`)) return
  const style = document.createElement('style')
  style.setAttribute(attribute, '')
  style.textContent = EDITOR_CSS
  target.prepend(style)
}
