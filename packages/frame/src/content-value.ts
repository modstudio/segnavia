import type { Scripts } from '@segnavia/format'
import type { ResolvedContent } from './controller.ts'

export interface ContentValue {
  content: ResolvedContent
  scripts: Scripts
  css: string
  cspExtra: string
}

export function comparableContent(
  content: ResolvedContent,
  resolveUrl: (path: string) => string,
  scripts: Scripts,
  css: string,
  cspExtra: string,
): ContentValue {
  const resolved = content.kind === 'url' || content.kind === 'image' || content.kind === 'shot' ? { ...content, src: resolveUrl(content.src) } : content
  return { content: resolved, scripts, css, cspExtra }
}

export function sameContent(left: ContentValue, right: ContentValue): boolean {
  return sameValue(left, right)
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => sameValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in rightRecord && sameValue(leftRecord[key], rightRecord[key]))
}
