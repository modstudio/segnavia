import type { HtmlProfileAlignment, HtmlProfileDirection, HtmlProfileHeadingLevel } from '@segnavia/html'

export const HTML_EDITOR_COMMANDS = [
  'bold',
  'italic',
  'underline',
  'link',
  'heading',
  'bullet-list',
  'ordered-list',
  'align',
  'direction',
  'undo',
  'redo',
] as const

export type HtmlEditorCommand = (typeof HTML_EDITOR_COMMANDS)[number]
export interface HtmlEditorCommandArgs {
  link: { href: string }
  heading: { level: HtmlProfileHeadingLevel }
  align: { value: HtmlProfileAlignment }
  direction: { value: HtmlProfileDirection }
}
export interface HtmlEditorCommandState {
  active: boolean
  enabled: boolean
}
export type HtmlEditorCommands = Record<HtmlEditorCommand, HtmlEditorCommandState>
