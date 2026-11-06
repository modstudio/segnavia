import {
  type AnyExtension,
  Extension,
  getExtensionField,
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
import {
  listSourceAttributes,
  sourceFormStarterExtensions,
  sourceListAttrs,
  tableRowSourceAttributes,
  tableSourceExtension,
  taskItemSourceExtension,
} from './markdown-rich-source-forms.ts'

const listAttributes = {
  loose: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-loose') === 'true',
    renderHTML: (attrs: Record<string, unknown>) => (attrs.loose ? { 'data-loose': 'true' } : {}),
  },
}
const listSeparator = (node: JSONContent) => (node.attrs?.loose ? '\n\n' : '\n')
const listItemPattern = /^(\s*)([-+*]|\d+[.)])(\s+)(?:\[[ xX]\]\s+)?/
type ListState = {
  baseIndent: number
  contentIndent: number
  fence?: { marker: string; length: number; indent: number }
  nestedIndent?: number
}

const indentWidth = (value: string) => value.replace(/\t/g, '    ').length
const lineIndent = (line: string) => indentWidth(/^\s*/.exec(line)?.[0] ?? '')
const itemContentIndent = (match: RegExpExecArray) => indentWidth(match[1] ?? '') + (match[2]?.length ?? 0) + indentWidth(match[3] ?? '')

function updateListContext(match: RegExpExecArray | null, indent: number, state: ListState) {
  if (match && indent === state.baseIndent) {
    state.contentIndent = itemContentIndent(match)
    state.nestedIndent = undefined
  } else if (match && indent >= state.contentIndent && state.nestedIndent === undefined) state.nestedIndent = indent
}

function consumeFence(line: string, indent: number, state: ListState): boolean {
  const match = /^(\s*)(`{3,}|~{3,})/.exec(line)
  if (!match || indent < state.contentIndent || state.nestedIndent !== undefined) return false
  const marker = match[2]?.[0] ?? ''
  const length = match[2]?.length ?? 0
  if (!state.fence) state.fence = { marker, length, indent }
  else if (marker === state.fence.marker && length >= state.fence.length && indent <= state.fence.indent) state.fence = undefined
  return true
}

function nextNonblank(lines: readonly string[], index: number): string | undefined {
  return lines.slice(index + 1).find((line) => !/^\s*$/.test(line))
}

function blankLineIsLoose(lines: readonly string[], index: number, state: ListState): boolean {
  const nextLine = nextNonblank(lines, index)
  if (nextLine === undefined) return false
  const nextItem = listItemPattern.exec(nextLine)
  const nextIndent = lineIndent(nextLine)
  if (nextItem && nextIndent === state.baseIndent) return true
  if (state.nestedIndent !== undefined) {
    if (nextIndent > state.nestedIndent || (nextItem && nextIndent === state.nestedIndent)) return false
    state.nestedIndent = undefined
  }
  return nextIndent >= state.contentIndent
}

function listLineIsLoose(lines: readonly string[], index: number, state: ListState): boolean {
  const line = lines[index] ?? ''
  const match = listItemPattern.exec(line)
  const indent = lineIndent(line)
  updateListContext(match, indent, state)
  if (consumeFence(line, indent, state)) return false
  return /^\s*$/.test(line) && state.fence === undefined && blankLineIsLoose(lines, index, state)
}

export function listIsLoose(raw: string): boolean {
  const lines = raw.split('\n')
  const firstMatch = listItemPattern.exec(lines.find((line) => listItemPattern.test(line)) ?? '')
  if (!firstMatch) return false
  const baseIndent = indentWidth(firstMatch[1] ?? '')
  const state: ListState = { baseIndent, contentIndent: itemContentIndent(firstMatch) }
  for (let index = 0; index < lines.length; index++) if (listLineIsLoose(lines, index, state)) return true
  return false
}

const LooseBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes, ...listSourceAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    if (token.type !== 'list' || token.ordered) return []
    return {
      type: 'bulletList',
      attrs: { loose: listIsLoose(token.raw ?? ''), ...sourceListAttrs(token.raw ?? '') },
      content: helpers.parseChildren(token.items ?? []),
    }
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return node.content ? helpers.renderChildren(node.content, listSeparator(node)) : ''
  },
})

const LooseOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes, ...listSourceAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    if (token.type !== 'list' || !token.ordered) return []
    return {
      type: 'orderedList',
      attrs: { start: token.start || 1, type: token.typeMarker ?? null, loose: listIsLoose(token.raw ?? ''), ...sourceListAttrs(token.raw ?? '', true) },
      content: helpers.parseChildren(token.items ?? []),
    }
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return node.content ? helpers.renderChildren(node.content, listSeparator(node)) : ''
  },
})

const LooseTaskList = TaskList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listAttributes, ...listSourceAttributes }
  },
  parseMarkdown(token, helpers: MarkdownParseHelpers) {
    return helpers.createNode(
      'taskList',
      { loose: listIsLoose(token.raw ?? ''), ...sourceListAttrs(token.raw ?? '') },
      helpers.parseChildren(token.items ?? []),
    )
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
      return { type: 'taskList', raw: token.raw, items }
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
  const starter = StarterKit.configure({ trailingNode: false, link: { openOnClick: false }, bulletList: false, orderedList: false })
  const starterChildren = getExtensionField(starter, 'addExtensions', { name: starter.name, options: starter.options, storage: starter.storage })?.() ?? []
  const tables = TableKit.configure()
  const tableChildren = getExtensionField(tables, 'addExtensions', { name: tables.name, options: tables.options, storage: tables.storage })?.() ?? []
  return [
    ...sourceFormStarterExtensions(starterChildren),
    LooseBulletList,
    LooseOrderedList,
    ...tableChildren.map((extension: AnyExtension) => {
      if (extension.name === 'tableRow') {
        return extension.extend({
          addAttributes(this: { parent?: () => Record<string, unknown> }) {
            return { ...this.parent?.(), ...tableRowSourceAttributes }
          },
        })
      }
      return tableSourceExtension(extension)
    }),
    LooseTaskList,
    taskItemSourceExtension(TaskItem.configure({ nested: true })),
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
