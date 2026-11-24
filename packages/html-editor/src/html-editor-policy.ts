import type { HtmlProfile, HtmlProfileAlignment } from '@segnavia/html'

type HtmlProfileDirection = 'auto' | 'rtl' | 'ltr'
type HtmlProfileHeadingLevel = NonNullable<HtmlProfile['blocks']['h']>[number]

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

export function commandProfileField(command: HtmlEditorCommand): string | undefined {
  if (command === 'bold' || command === 'italic' || command === 'underline' || command === 'link') return `marks.${command}`
  if (command === 'heading') return 'blocks.h'
  if (command === 'bullet-list') return 'blocks.ul'
  if (command === 'ordered-list') return 'blocks.ol'
  if (command === 'align') return 'align'
  if (command === 'direction') return 'direction'
  return undefined
}

export function commandAdmitted(profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): boolean {
  if (command === 'bold' || command === 'italic' || command === 'underline' || command === 'link') return profile.marks.includes(command)
  if (command === 'heading') {
    if (args?.level === undefined) return profile.blocks.h !== undefined
    return profile.blocks.h?.includes(Number(args.level) as HtmlProfileHeadingLevel) ?? false
  }
  if (command === 'bullet-list') return profile.blocks.ul === true
  if (command === 'ordered-list') return profile.blocks.ol !== undefined
  if (command === 'align') {
    if (args?.value === undefined) return profile.align !== undefined
    return profile.align?.includes(String(args.value) as HtmlProfileAlignment) ?? false
  }
  if (command === 'direction') return profile.direction === true
  return true
}

export function commandRefusal(profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): Error | undefined {
  if (commandAdmitted(profile, command, args)) return undefined
  const field = commandProfileField(command)
  if (!field) return undefined
  return new Error(`HTML editor command ${JSON.stringify(command)} is outside the profile; admit it with profile.${field} to clear this refusal.`)
}
