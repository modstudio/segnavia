import type { CssToken } from './css-tokens.ts'

const DATA_IMAGE = /^data:image\//i
const DATA_FONT = /^data:(?:font\/[^;,]+|application\/(?:x-)?font-[^;,]+)(?:[;,])/i
export const FETCH_FUNCTIONS = ['url', 'src', 'image-set', '-webkit-image-set'] as const
export const FETCH_AT_KEYWORDS = ['import'] as const
export const FETCH_FUNCTION_SET = new Set<string>(FETCH_FUNCTIONS)
export const FETCH_AT_KEYWORD_SET = new Set<string>(FETCH_AT_KEYWORDS)

function matchingClose(list: readonly CssToken[], open: number): number {
  let depth = 1
  for (let at = open + 1; at < list.length; at++) {
    if (list[at]?.kind === 'open' || list[at]?.kind === 'function') depth++
    if (list[at]?.kind === 'close' && --depth === 0) return at
  }
  return list.length
}

function fetchUrl(value: string): string | undefined {
  const normalized = value.trim().toLowerCase()
  return normalized && !normalized.startsWith('#') && !DATA_IMAGE.test(normalized) && !DATA_FONT.test(normalized) ? normalized : undefined
}

function imageSetUrls(list: readonly CssToken[], at: number): string[] {
  const urls: string[] = []
  const close = matchingClose(list, at)
  let depth = 0
  for (let item = at + 1; item < close; item++) {
    const held = list[item]
    if (held?.kind === 'function' || held?.kind === 'open') depth++
    else if (held?.kind === 'close') depth--
    else if (depth === 0 && (held?.kind === 'string' || held?.kind === 'url')) {
      const url = fetchUrl(held.value)
      if (url) urls.push(url)
    }
  }
  return urls
}

function functionUrls(list: readonly CssToken[], at: number): string[] {
  const token = list[at]
  if (token?.kind !== 'function' || !FETCH_FUNCTION_SET.has(token.value)) return []
  if (token.value === 'image-set' || token.value === '-webkit-image-set') return imageSetUrls(list, at)
  const value = list[at + 1]
  if (!value || (value.kind !== 'string' && value.kind !== 'word' && value.kind !== 'url')) return []
  const url = fetchUrl(value.value)
  return url ? [url] : []
}

export function cssNetworkUrls(list: readonly CssToken[], at: number): string[] {
  const token = list[at]
  if (token?.kind === 'url') {
    const url = fetchUrl(token.value)
    return url ? [url] : []
  }
  const functions = functionUrls(list, at)
  if (functions.length > 0 || token?.kind === 'function') return functions
  if (token?.kind !== 'at' || !FETCH_AT_KEYWORD_SET.has(token.value)) return []
  const value = list[at + 1]
  if (!value || (value.kind !== 'string' && value.kind !== 'url')) return []
  const url = fetchUrl(value.value)
  return url ? [url] : []
}
