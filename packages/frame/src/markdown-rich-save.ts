import type { JSONContent } from '@tiptap/core'
import { Node } from '@tiptap/pm/model'
import { richMarkdownManager, richSchema } from './markdown-rich-extensions.ts'
import { isLockedToken, isSilentToken, lockedNode, type MarkedToken } from './markdown-rich-locked.ts'

type Json = JSONContent
type Block = { raw: string; sep: string; nodes: Json[] }
export type DocumentBodyTransform = { split: (source: string) => { editable: string; retained: string }; join: (editable: string, retained: string) => string }
export type RichDocumentOptions = { bodyTransform?: DocumentBodyTransform; lockedFences?: Record<string, string> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function keptAttrs(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  const kept = Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)))
  return Object.keys(kept).length ? kept : undefined
}
function canonical(node: Json): unknown {
  const next: Record<string, unknown> = { type: node.type }
  if (typeof node.text === 'string') next.text = node.text
  const attrs = node.attrs && isRecord(node.attrs) ? keptAttrs(node.attrs) : undefined
  if (attrs) next.attrs = attrs
  if (node.marks?.length) next.marks = node.marks.map((mark) => canonical(mark as Json))
  if (node.content?.length) next.content = node.content.map(canonical)
  return next
}
const nodeKey = (node: Json) => JSON.stringify(canonical(node))
const isEmptyParagraph = (node: Json) => node.type === 'paragraph' && !node.content?.length && !node.text
const dropTrailingEmptyParagraph = (nodes: Json[]) => (nodes.length && isEmptyParagraph(nodes[nodes.length - 1]!) ? nodes.slice(0, -1) : nodes)
const restoreAmpersands = (markdown: string) => markdown.replace(/&amp;(?![a-zA-Z][a-zA-Z0-9]*;)/g, '&')

function parseBlock(token: MarkedToken, raw: string, lockedFences: Record<string, string>): Json[] {
  if (isSilentToken(token)) return []
  if (isLockedToken(token, lockedFences)) return [lockedNode(raw, lockedFences[token.lang?.toLowerCase() ?? ''])]
  const parsed = richMarkdownManager().parse(raw)
  return (Node.fromJSON(richSchema(), parsed).toJSON().content ?? []) as Json[]
}

function blocks(markdown: string, lockedFences: Record<string, string> = {}): Block[] {
  const out: Block[] = []
  const tokens = richMarkdownManager().instance.lexer(markdown) as MarkedToken[]
  let at = 0
  let prevEnd = 0
  for (const token of tokens) {
    const start = at
    at += token.raw.length
    if (token.type === 'space') continue
    const raw = token.raw.replace(/\n+$/, '')
    out.push({ raw, sep: markdown.slice(prevEnd, start), nodes: parseBlock(token, raw, lockedFences) })
    prevEnd = start + raw.length
  }
  return out
}

function nodesMatchBlocks(bs: Block[], edited: Json[]): boolean {
  const original = bs.flatMap((block) => block.nodes)
  return original.length === edited.length && original.every((node, index) => nodeKey(node) === nodeKey(edited[index]!))
}
function serializeNodes(nodes: Json[]): string {
  return restoreAmpersands(richMarkdownManager().serialize({ type: 'doc', content: nodes }).trim())
}
function stitch(bs: Block[], edited: Json[]): string {
  const keys = edited.map(nodeKey)
  let out = ''
  let last = -1
  let blockIndex = 0
  let keyIndex = 0
  const pending: Json[] = []
  const emitNew = () => {
    if (!pending.length) return
    out += (out ? '\n\n' : (bs[blockIndex]?.sep ?? '')) + serializeNodes(pending.splice(0))
    last = -1
  }
  const emitOld = (hit: number) => {
    out += out ? (last === hit - 1 ? bs[hit]!.sep : '\n\n') : bs[hit]!.sep
    out += bs[hit]!.raw
    last = hit
  }
  while (keyIndex < keys.length) {
    const hit = bs.findIndex((block, index) => index >= blockIndex && block.nodes.length > 0 && block.nodes.every((node, offset) => keys[keyIndex + offset] === nodeKey(node)))
    if (hit < 0) {
      pending.push(edited[keyIndex++]!)
      continue
    }
    emitNew()
    for (let index = blockIndex; index < hit; index++) if (bs[index]!.nodes.length === 0) emitOld(index)
    emitOld(hit)
    keyIndex += bs[hit]!.nodes.length
    blockIndex = hit + 1
  }
  emitNew()
  for (let index = blockIndex; index < bs.length; index++) if (bs[index]!.nodes.length === 0) emitOld(index)
  return `${out.replace(/\n+$/, '')}\n`
}

export function parseRichDocument(markdown: string, options: RichDocumentOptions = {}): Json[] {
  const editable = options.bodyTransform?.split(markdown).editable ?? markdown
  return dropTrailingEmptyParagraph(blocks(editable, options.lockedFences).flatMap((block) => block.nodes))
}
export function saveRichDocument(original: string, edited: Json[], options: RichDocumentOptions = {}): string {
  const prepared = dropTrailingEmptyParagraph(edited)
  const split = options.bodyTransform?.split(original)
  const editable = split?.editable ?? original
  const editableBlocks = blocks(editable, options.lockedFences)
  if (nodesMatchBlocks(editableBlocks, prepared)) return original
  const saved = stitch(editableBlocks, prepared)
  return split && options.bodyTransform ? options.bodyTransform.join(saved, split.retained) : saved
}
