import { HTML_PROFILE_DIRECTIONS, type HtmlProfile, type HtmlProfileAlignment, type HtmlProfileHeadingLevel } from '@segnavia/html'
import type { Editor } from '@tiptap/core'
import { htmlEditorBlockTypes } from './html-editor-extensions.ts'
import { HTML_EDITOR_COMMANDS, type HtmlEditorCommand, type HtmlEditorCommands } from './html-editor-policy.ts'

function currentBlockType(editor: Editor, profile: HtmlProfile): string | undefined {
  return htmlEditorBlockTypes(profile).find((name) => editor.isActive(name))
}

function updateCurrentBlock(editor: Editor, profile: HtmlProfile, attributes: Record<string, unknown>): boolean {
  const type = currentBlockType(editor, profile)
  return type ? editor.chain().focus().updateAttributes(type, attributes).run() : false
}

interface HtmlEditorCommandDefinition {
  profileField: (profile: HtmlProfile, args?: Record<string, unknown>) => string | undefined
  admitted: (profile: HtmlProfile, args?: Record<string, unknown>) => boolean
  run: (editor: Editor, profile: HtmlProfile, args?: Record<string, unknown>) => boolean
  active: (editor: Editor, profile: HtmlProfile) => boolean
  canRun: (editor: Editor, profile: HtmlProfile) => boolean
}

function markDefinition(
  mark: 'bold' | 'italic' | 'underline',
  toggle: (editor: Editor) => boolean,
  canToggle: (editor: Editor) => boolean,
): HtmlEditorCommandDefinition {
  return {
    profileField: () => `marks.${mark}`,
    admitted: (profile) => profile.marks.includes(mark),
    run: toggle,
    active: (editor) => editor.isActive(mark),
    canRun: canToggle,
  }
}

function hrefAdmitted(profile: HtmlProfile, href: unknown): boolean {
  if (!profile.marks.includes('link') || !profile.links) return false
  if (href === undefined) return true
  try {
    const scheme = new URL(String(href)).protocol.replace(/:$/, '')
    return profile.links.schemes.includes(scheme as (typeof profile.links.schemes)[number])
  } catch {
    return false
  }
}

const COMMAND_DEFINITIONS = {
  bold: markDefinition(
    'bold',
    (editor) => editor.chain().focus().toggleBold().run(),
    (editor) => editor.can().toggleBold(),
  ),
  italic: markDefinition(
    'italic',
    (editor) => editor.chain().focus().toggleItalic().run(),
    (editor) => editor.can().toggleItalic(),
  ),
  underline: markDefinition(
    'underline',
    (editor) => editor.chain().focus().toggleUnderline().run(),
    (editor) => editor.can().toggleUnderline(),
  ),
  link: {
    profileField: (profile, args) => (profile.marks.includes('link') && !profile.links ? 'links.schemes' : args?.href === undefined ? 'marks.link' : 'links.schemes'),
    admitted: (profile, args) => hrefAdmitted(profile, args?.href),
    run: (editor, _profile, args) => editor.chain().focus().extendMarkRange('link').setLink({ href: String(args?.href) }).run(),
    active: (editor) => editor.isActive('link'),
    canRun: (editor, profile) => editor.can().setLink({ href: `${profile.links?.schemes[0] ?? 'https'}://example.invalid` }),
  },
  heading: {
    profileField: () => 'blocks.h',
    admitted: (profile, args) => args === undefined || args.level === undefined ? profile.blocks.h !== undefined : profile.blocks.h?.includes(Number(args.level) as HtmlProfileHeadingLevel) ?? false,
    run: (editor, _profile, args) => editor.chain().focus().toggleHeading({ level: Number(args?.level) as HtmlProfileHeadingLevel }).run(),
    active: (editor) => editor.isActive('heading'),
    canRun: (editor, profile) => editor.can().toggleHeading({ level: profile.blocks.h?.[0] ?? 1 }),
  },
  'bullet-list': {
    profileField: () => 'blocks.ul',
    admitted: (profile) => profile.blocks.ul === true,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    active: (editor) => editor.isActive('bulletList'),
    canRun: (editor) => editor.can().toggleBulletList(),
  },
  'ordered-list': {
    profileField: () => 'blocks.ol',
    admitted: (profile) => profile.blocks.ol !== undefined,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    active: (editor) => editor.isActive('orderedList'),
    canRun: (editor) => editor.can().toggleOrderedList(),
  },
  align: {
    profileField: () => 'align',
    admitted: (profile, args) => args === undefined ? profile.align !== undefined : profile.align?.includes(String(args.value) as HtmlProfileAlignment) ?? false,
    run: (editor, profile, args) => updateCurrentBlock(editor, profile, { textAlign: String(args?.value) }),
    active: (editor, profile) => {
      const block = currentBlockType(editor, profile)
      return Boolean(block && editor.getAttributes(block).textAlign)
    },
    canRun: (editor, profile) => currentBlockType(editor, profile) !== undefined,
  },
  direction: {
    profileField: () => 'direction',
    admitted: (profile, args) => args === undefined ? profile.direction === true : profile.direction === true && HTML_PROFILE_DIRECTIONS.includes(String(args.value) as (typeof HTML_PROFILE_DIRECTIONS)[number]),
    run: (editor, profile, args) => updateCurrentBlock(editor, profile, { dir: String(args?.value) }),
    active: (editor, profile) => {
      const block = currentBlockType(editor, profile)
      return Boolean(block && (editor.getAttributes(block).dir ?? 'auto') !== 'auto')
    },
    canRun: (editor, profile) => currentBlockType(editor, profile) !== undefined,
  },
  undo: {
    profileField: () => undefined,
    admitted: () => true,
    run: (editor) => editor.chain().focus().undo().run(),
    active: () => false,
    canRun: (editor) => editor.can().undo(),
  },
  redo: {
    profileField: () => undefined,
    admitted: () => true,
    run: (editor) => editor.chain().focus().redo().run(),
    active: () => false,
    canRun: (editor) => editor.can().redo(),
  },
} satisfies Record<HtmlEditorCommand, HtmlEditorCommandDefinition>

export function commandAdmitted(profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): boolean {
  return COMMAND_DEFINITIONS[command].admitted(profile, args)
}

export function commandRefusal(profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): Error | undefined {
  const actionArgs = args ?? {}
  const definition = COMMAND_DEFINITIONS[command]
  if (definition.admitted(profile, actionArgs)) return undefined
  const field = definition.profileField(profile, actionArgs)
  if (!field) return undefined
  return new Error(`HTML editor command ${JSON.stringify(command)} is outside the profile; admit it with profile.${field} to clear this refusal.`)
}

export function runHtmlEditorCommand(editor: Editor, profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): boolean {
  return COMMAND_DEFINITIONS[command].run(editor, profile, args)
}

export function htmlEditorCommands(editor: Editor | null, profile: HtmlProfile): HtmlEditorCommands {
  return Object.fromEntries(
    HTML_EDITOR_COMMANDS.map((command) => [
      command,
      {
        active: editor ? COMMAND_DEFINITIONS[command].active(editor, profile) : false,
        enabled: Boolean(editor && commandAdmitted(profile, command) && COMMAND_DEFINITIONS[command].canRun(editor, profile)),
      },
    ]),
  ) as unknown as HtmlEditorCommands
}
