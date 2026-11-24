import type { HtmlProfile } from '@segnavia/html'
import type { Editor } from '@tiptap/core'
import { htmlEditorBlockTypes } from './html-editor-extensions.ts'
import { commandAdmitted, HTML_EDITOR_COMMANDS, type HtmlEditorCommand, type HtmlEditorCommands } from './html-editor-policy.ts'

function updateCurrentBlock(editor: Editor, profile: HtmlProfile, attributes: Record<string, unknown>): boolean {
  const type = htmlEditorBlockTypes(profile).find((name) => editor.isActive(name))
  return type ? editor.chain().focus().updateAttributes(type, attributes).run() : false
}

export function runHtmlEditorCommand(editor: Editor, profile: HtmlProfile, command: HtmlEditorCommand, args?: Record<string, unknown>): boolean {
  if (command === 'bold') return editor.chain().focus().toggleBold().run()
  if (command === 'italic') return editor.chain().focus().toggleItalic().run()
  if (command === 'underline') return editor.chain().focus().toggleUnderline().run()
  if (command === 'link')
    return editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: String(args?.href ?? '') })
      .run()
  if (command === 'heading')
    return editor
      .chain()
      .focus()
      .toggleHeading({ level: Number(args?.level) as 1 | 2 | 3 | 4 | 5 | 6 })
      .run()
  if (command === 'bullet-list') return editor.chain().focus().toggleBulletList().run()
  if (command === 'ordered-list') return editor.chain().focus().toggleOrderedList().run()
  if (command === 'align') return updateCurrentBlock(editor, profile, { textAlign: String(args?.value) })
  if (command === 'direction') return updateCurrentBlock(editor, profile, { dir: String(args?.value) })
  if (command === 'undo') return editor.chain().focus().undo().run()
  return editor.chain().focus().redo().run()
}

function currentBlockType(editor: Editor, profile: HtmlProfile): string | undefined {
  return htmlEditorBlockTypes(profile).find((name) => editor.isActive(name))
}

function commandActive(editor: Editor, profile: HtmlProfile, command: HtmlEditorCommand): boolean {
  const name = command === 'bullet-list' ? 'bulletList' : command === 'ordered-list' ? 'orderedList' : command
  if (command === 'undo' || command === 'redo') return false
  if (command === 'align') {
    const block = currentBlockType(editor, profile)
    return Boolean(block && editor.getAttributes(block).textAlign)
  }
  if (command === 'direction') {
    const block = currentBlockType(editor, profile)
    return Boolean(block && (editor.getAttributes(block).dir ?? 'auto') !== 'auto')
  }
  return editor.isActive(name)
}

function commandCanRun(editor: Editor, profile: HtmlProfile, command: HtmlEditorCommand): boolean {
  if (command === 'undo') return editor.can().undo()
  if (command === 'redo') return editor.can().redo()
  if (command === 'align' || command === 'direction') return currentBlockType(editor, profile) !== undefined
  const chain = editor.can()
  if (command === 'bold') return chain.toggleBold()
  if (command === 'italic') return chain.toggleItalic()
  if (command === 'underline') return chain.toggleUnderline()
  if (command === 'link') return chain.setLink({ href: 'https://example.invalid' })
  if (command === 'heading') return chain.toggleHeading({ level: profile.blocks.h?.[0] ?? 1 })
  if (command === 'bullet-list') return chain.toggleBulletList()
  return chain.toggleOrderedList()
}

export function htmlEditorCommands(editor: Editor | null, profile: HtmlProfile): HtmlEditorCommands {
  return Object.fromEntries(
    HTML_EDITOR_COMMANDS.map((command) => [
      command,
      {
        active: editor ? commandActive(editor, profile, command) : false,
        enabled: Boolean(editor && commandAdmitted(profile, command) && commandCanRun(editor, profile, command)),
      },
    ]),
  ) as unknown as HtmlEditorCommands
}
