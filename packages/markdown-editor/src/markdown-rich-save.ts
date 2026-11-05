import type { JSONContent } from '@tiptap/core'
import type { MarkdownManager } from '@tiptap/markdown'
import { Node } from '@tiptap/pm/model'
import { richMarkdownManager, richSchema, scopedRichMarkdownManager } from './markdown-rich-extensions.ts'
import { isLockedToken, isSilentToken, lockedFenceLabel, lockedNode, type MarkedToken } from './markdown-rich-locked.ts'
import { normalizeReferenceLabel, RAW_INLINE_NAME } from './markdown-rich-raw-inline.ts'

type Json = JSONContent
export type RichDocumentNode = Json | Node
type Block = { raw: string; sep: string; nodes: Json[]; keys: string[] }
type Split = { editable: string; retained: string } | undefined
type CachedOriginal = {
  original: string
  fencesKey: string
  bodyTransform: DocumentBodyTransform | undefined
  split: Split
  blocks: Block[]
  nodes: Json[]
  keys: string[]
  indicesByFirstKey: Map<string, number[]>
}
export type DocumentBodyTransform = { split: (source: string) => { editable: string; retained: string }; join: (editable: string, retained: string) => string }
export type RichDocumentOptions = { bodyTransform?: DocumentBodyTransform; lockedFences?: Record<string, string> }

let cachedOriginal: CachedOriginal | undefined
const objectKeys = new WeakMap<object, string>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function keptAttrs(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  const kept = Object.fromEntries(
    Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)),
  )
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
function asJson(node: RichDocumentNode): Json {
  return node instanceof Node ? node.toJSON() : node
}
function nodeKey(node: RichDocumentNode): string {
  const cached = objectKeys.get(node)
  if (cached !== undefined) return cached
  const key = JSON.stringify(canonical(asJson(node)))
  objectKeys.set(node, key)
  return key
}
const isEmptyParagraph = (node: RichDocumentNode) => {
  const json = asJson(node)
  return json.type === 'paragraph' && !json.content?.length && !json.text
}
const dropTrailingEmptyParagraph = <T extends RichDocumentNode>(nodes: readonly T[]): readonly T[] => {
  const last = nodes.at(-1)
  return last && isEmptyParagraph(last) ? nodes.slice(0, -1) : nodes
}
const restoreAmpersands = (markdown: string) => markdown.replace(/&amp;(?![a-zA-Z][a-zA-Z0-9]*;)/g, '&')

function parseBlock(manager: MarkdownManager, token: MarkedToken, raw: string, lockedFences: Record<string, string>): Json[] {
  if (isSilentToken(token)) return []
  if (isLockedToken(token, lockedFences)) return [lockedNode(raw, lockedFenceLabel(lockedFences, token.lang))]
  const parsed = manager.parse(raw)
  return (Node.fromJSON(richSchema(), parsed).toJSON().content ?? []) as Json[]
}

function blocks(markdown: string, lockedFences: Record<string, string> = {}): Block[] {
  const out: Block[] = []
  const initialTokens = richMarkdownManager().instance.lexer(markdown) as MarkedToken[]
  const labels = new Set<string>()
  for (const token of initialTokens) {
    const definition = token.type === 'def' ? /^ {0,3}\[([^\]]+)\]:/.exec(token.raw)?.[1] : undefined
    if (definition !== undefined) labels.add(normalizeReferenceLabel(definition))
  }
  const manager = scopedRichMarkdownManager(labels)
  const tokens = manager.instance.lexer(markdown) as MarkedToken[]
  let at = 0
  let prevEnd = 0
  for (const token of tokens) {
    const start = at
    at += token.raw.length
    if (token.type === 'space') continue
    const raw = token.raw.replace(/\n+$/, '')
    const nodes = parseBlock(manager, token, raw, lockedFences)
    out.push({ raw, sep: markdown.slice(prevEnd, start), nodes, keys: nodes.map(nodeKey) })
    prevEnd = start + raw.length
  }
  return out
}

function fencesKey(lockedFences: Record<string, string> | undefined): string {
  return JSON.stringify(Object.entries(lockedFences ?? {}).sort(([left], [right]) => left.localeCompare(right)))
}

function originalEntry(original: string, options: RichDocumentOptions): CachedOriginal {
  const nextFencesKey = fencesKey(options.lockedFences)
  if (cachedOriginal?.original === original && cachedOriginal.fencesKey === nextFencesKey && cachedOriginal.bodyTransform === options.bodyTransform)
    return cachedOriginal
  const split = options.bodyTransform?.split(original)
  const editableBlocks = blocks(split?.editable ?? original, options.lockedFences)
  const nodes = editableBlocks.flatMap((block) => block.nodes)
  const keys = editableBlocks.flatMap((block) => block.keys)
  const indicesByFirstKey = new Map<string, number[]>()
  for (const [index, block] of editableBlocks.entries()) {
    const first = block.keys[0]
    if (first === undefined) continue
    const indices = indicesByFirstKey.get(first) ?? []
    indices.push(index)
    indicesByFirstKey.set(first, indices)
  }
  cachedOriginal = { original, fencesKey: nextFencesKey, bodyTransform: options.bodyTransform, split, blocks: editableBlocks, nodes, keys, indicesByFirstKey }
  return cachedOriginal
}

function firstAtOrAfter(indices: readonly number[], minimum: number): number {
  let low = 0
  let high = indices.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((indices[middle] ?? Number.POSITIVE_INFINITY) < minimum) low = middle + 1
    else high = middle
  }
  return indices[low] ?? -1
}

function serializeNodes(nodes: readonly RichDocumentNode[]): string {
  const json = nodes.map(asJson)
  let marker = '\uE000raw-inline-amp\uE001'
  const source = JSON.stringify(json)
  while (source.includes(marker)) marker += '-'
  const protect = (node: Json): Json => ({
    ...node,
    attrs:
      node.type === RAW_INLINE_NAME && typeof node.attrs?.source === 'string'
        ? { ...node.attrs, source: node.attrs.source.replaceAll('&', marker) }
        : node.attrs,
    content: node.content?.map(protect),
  })
  return restoreAmpersands(
    richMarkdownManager()
      .serialize({ type: 'doc', content: json.map(protect) })
      .trim(),
  ).replaceAll(marker, '&')
}

function matchingBlockIndex(entry: CachedOriginal, keys: readonly string[], keyIndex: number, blockIndex: number): number {
  const currentKey = keys[keyIndex]
  if (currentKey === undefined) return -1
  const candidates = entry.indicesByFirstKey.get(currentKey) ?? []
  let hit = firstAtOrAfter(candidates, blockIndex)
  let block = entry.blocks[hit]
  while (hit >= 0 && !block?.keys.every((key, offset) => keys[keyIndex + offset] === key)) {
    hit = firstAtOrAfter(candidates, hit + 1)
    block = entry.blocks[hit]
  }
  return hit
}

function stitch(entry: CachedOriginal, edited: readonly RichDocumentNode[], keys: readonly string[]): string {
  const bs = entry.blocks
  let out = ''
  let last = -1
  let blockIndex = 0
  let keyIndex = 0
  const pending: RichDocumentNode[] = []
  const emitNew = () => {
    if (!pending.length) return
    out += (out ? '\n\n' : (bs[blockIndex]?.sep ?? '')) + serializeNodes(pending.splice(0))
    last = -1
  }
  const emitOld = (hit: number) => {
    const block = bs[hit]
    if (!block) throw new Error(`Cannot stitch missing rich Markdown block ${hit}.`)
    out += out ? (last === hit - 1 ? block.sep : '\n\n') : block.sep
    out += block.raw
    last = hit
  }
  const emitReplacement = (end: number) => {
    let firstEditable = blockIndex
    while (firstEditable < end && bs[firstEditable]?.nodes.length === 0) {
      emitOld(firstEditable)
      firstEditable++
    }
    emitNew()
    for (let index = firstEditable; index < end; index++) if (bs[index]?.nodes.length === 0) emitOld(index)
  }
  while (keyIndex < keys.length) {
    const hit = matchingBlockIndex(entry, keys, keyIndex, blockIndex)
    if (hit < 0) {
      const node = edited[keyIndex++]
      if (node) pending.push(node)
      continue
    }
    emitReplacement(hit)
    emitOld(hit)
    keyIndex += bs[hit]?.nodes.length ?? 0
    blockIndex = hit + 1
  }
  emitReplacement(bs.length)
  return `${out.replace(/\n+$/, '')}\n`
}

export function parseRichDocument(markdown: string, options: RichDocumentOptions = {}): Json[] {
  return dropTrailingEmptyParagraph(originalEntry(markdown, options).nodes) as Json[]
}
export function saveRichDocument(original: string, edited: readonly RichDocumentNode[], options: RichDocumentOptions = {}): string {
  const prepared = dropTrailingEmptyParagraph(edited)
  const entry = originalEntry(original, options)
  const keys = prepared.map(nodeKey)
  if (entry.keys.length === keys.length && entry.keys.every((key, index) => key === keys[index])) return original
  const saved = stitch(entry, prepared, keys)
  return entry.split && options.bodyTransform ? options.bodyTransform.join(saved, entry.split.retained) : saved
}
