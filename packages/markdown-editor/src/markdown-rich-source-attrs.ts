import type { JSONContent } from '@tiptap/core'
import { RAW_INLINE_NAME } from './markdown-rich-raw-inline.ts'

type MeaningfulOptions = {
  keepEmptyArrays?: boolean
  omitDefaultTableSpans?: boolean
}

export function isRecordedSourceAttr(key: string, nodeType: unknown): boolean {
  return key.startsWith('source') && !(nodeType === RAW_INLINE_NAME && key === 'source')
}

export function meaningfulAttributes(value: unknown, options: MeaningfulOptions = {}, attrNodeType?: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => meaningfulAttributes(item, options))
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const nodeType = record.type ?? attrNodeType
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) {
    if (key === 'dir' || isRecordedSourceAttr(key, nodeType) || item === null || item === undefined) continue
    if (!options.keepEmptyArrays && Array.isArray(item) && item.length === 0) continue
    if (options.omitDefaultTableSpans && (key === 'colspan' || key === 'rowspan') && item === 1) continue
    const next = meaningfulAttributes(item, options, key === 'attrs' ? nodeType : undefined)
    if (next && typeof next === 'object' && !Array.isArray(next) && Object.keys(next as Record<string, unknown>).length === 0) continue
    out[key] = next
  }
  return out
}

export function withoutRecordedSourceAttrs(value: JSONContent): JSONContent {
  const attrs = value.attrs ? Object.fromEntries(Object.entries(value.attrs).filter(([key]) => !isRecordedSourceAttr(key, value.type))) : value.attrs
  return {
    ...value,
    attrs,
    marks: value.marks?.map((mark) => withoutRecordedSourceAttrs(mark as JSONContent)) as JSONContent['marks'],
    content: value.content?.map(withoutRecordedSourceAttrs),
  }
}
