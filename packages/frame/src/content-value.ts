import type { Scripts } from '@segnavia/format'
import type { ResolvedContent, ResolvedUrlContent } from './controller-types.ts'

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
  if (left.content.kind === 'url' && right.content.kind === 'url') {
    const useKey = hasReuseKey(left.content) && hasReuseKey(right.content)
    return sameValue({ ...left, content: comparableUrl(left.content, useKey) }, { ...right, content: comparableUrl(right.content, useKey) })
  }
  return sameValue(left, right)
}

function hasReuseKey(content: ResolvedContent): content is ResolvedUrlContent & { reuseKey: string } {
  return content.kind === 'url' && typeof content.reuseKey === 'string'
}

function comparableUrl(content: ResolvedUrlContent, useKey: boolean) {
  const { src, reuseKey, ...rest } = content
  return useKey ? { ...rest, reuseKey } : { ...rest, src }
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
