import { type AnyExtension, Extension, getSchema } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import type { Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { LockedBlock } from './markdown-rich-locked.ts'

const directionalBlocks = Extension.create({
  name: 'directionalBlocks',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'codeBlock', 'tableCell', 'tableHeader'],
        attributes: { dir: { default: 'auto', renderHTML: () => ({ dir: 'auto' }) } },
      },
    ]
  },
})

export function richExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ trailingNode: false, link: { openOnClick: false } }),
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: true }),
    directionalBlocks,
    LockedBlock,
  ]
}

let manager: MarkdownManager | undefined
export function richMarkdownManager(): MarkdownManager {
  manager ??= new MarkdownManager({ extensions: richExtensions(), markedOptions: { gfm: true } })
  return manager
}

let schema: Schema | undefined
export function richSchema(): Schema {
  schema ??= getSchema(richExtensions())
  return schema
}
