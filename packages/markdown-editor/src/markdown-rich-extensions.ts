import {
  type AnyExtension,
  Extension,
  getSchema,
  type JSONContent,
  type MarkdownLexerConfiguration,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
} from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { BulletList, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import type { Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { Marked, type marked } from 'marked'
import { LockedBlock } from './markdown-rich-locked.ts'
import { rawInline } from './markdown-rich-raw-inline.ts'

const listAttributes = {
  loose: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-loose') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.loose ? { 'data-loose': 'true' } : {}),
  },
}
const listSeparator = (node: JSONContent) => (node.attrs?.loose ? '\n\n' : '\n')

export function taskListIsLoose(raw: string): boolean {
  const lines = raw.split('\n')
  const item = /^(\s*)[-+*]\s+\[[ xX]\]\s+/
  const firstItem = lines.find((line) => item.test(line))
  const baseIndent = firstItem?.match(item)?.[1]?.length
  if (baseIndent === undefined) return false
  let currentItem = -1
  for (let index = 0; index < lines.length; index++) {
    const match = item.exec(lines[index] ?? '')
    if (match?.[1]?.length === baseIndent) currentItem = index
    if (!/^\s*$/.test(lines[index] ?? '')) continue
    const offset = lines.slice(index + 1).findIndex((line) => !/^\s*$/.test(line))
    if (offset < 0) continue
    const next = index + offset + 1
    const nextLine = lines[next] ?? ''
    const nextItem = item.exec(nextLine)
    if (nextItem?.[1]?.length === baseIndent) return true
    const indent = /^(\s*)/.exec(nextLine)?.[1]?.replace(/\t/g, '    ').length ?? 0
    if (currentItem >= 0 && indent > baseIndent) return true
  }
  return false
}

const LooseBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    if (token.type !== 'list' || token.ordered) return []
    return { type: 'bulletList', attrs: { loose: Boolean(token.loose) }, content: helpers.parseChildren(token.items ?? []) }
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return node.content ? helpers.renderChildren(node.content, listSeparator(node)) : ''
  },
})

const LooseOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    if (token.type !== 'list' || !token.ordered) return []
    return {
      type: 'orderedList',
      attrs: { start: token.start || 1, type: token.typeMarker ?? null, loose: Boolean(token.loose) || /\n[ \t]*\n/.test(token.raw ?? '') },
      content: helpers.parseChildren(token.items ?? []),
    }
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return node.content ? helpers.renderChildren(node.content, listSeparator(node)) : ''
  },
})

const LooseTaskList = TaskList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    return helpers.createNode('taskList', { loose: taskListIsLoose(token.raw ?? '') }, helpers.parseChildren(token.items ?? []))
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return node.content ? helpers.renderChildren(node.content, listSeparator(node)) : ''
  },
  markdownTokenizer: {
    name: 'taskList',
    level: 'block',
    start: (src: string) => src.search(/^\s*[-+*]\s+\[[ xX]\]\s+/m),
    tokenize(src: string, _tokens: unknown[], lexer: MarkdownLexerConfiguration) {
      const token = new Marked().lexer(src)[0]
      if (token?.type !== 'list' || token.ordered || !token.items?.every((item: { task?: boolean }) => item.task)) return undefined
      const items = token.items.map((item: { raw: string; text: string; checked?: boolean }) => {
        const lines = item.text.split('\n')
        const mainContent = lines.shift() ?? ''
        const nested = lines.join('\n').trim()
        return {
          type: 'taskItem',
          raw: item.raw,
          checked: item.checked ?? false,
          text: mainContent,
          tokens: lexer.inlineTokens(mainContent),
          nestedTokens: nested ? lexer.blockTokens(`${nested}\n`) : [],
        }
      })
      return { type: 'taskList', raw: token.raw, loose: token.loose, items }
    },
  },
})

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

export function richExtensions(definitionLabels: ReadonlySet<string> = new Set()): AnyExtension[] {
  return [
    StarterKit.configure({ trailingNode: false, link: { openOnClick: false }, bulletList: false, orderedList: false }),
    LooseBulletList,
    LooseOrderedList,
    TableKit,
    LooseTaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: true }),
    directionalBlocks,
    LockedBlock,
    rawInline(definitionLabels),
  ]
}

let manager: MarkdownManager | undefined
const isolatedMarked = () => new Marked() as unknown as typeof marked
export function richMarkdownManager(): MarkdownManager {
  manager ??= new MarkdownManager({ marked: isolatedMarked(), extensions: richExtensions(), markedOptions: { gfm: true } })
  return manager
}

export function scopedRichMarkdownManager(definitionLabels: ReadonlySet<string>): MarkdownManager {
  return new MarkdownManager({ marked: isolatedMarked(), extensions: richExtensions(definitionLabels), markedOptions: { gfm: true } })
}

let schema: Schema | undefined
export function richSchema(): Schema {
  schema ??= getSchema(richExtensions())
  return schema
}
