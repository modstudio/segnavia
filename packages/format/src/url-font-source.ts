import { catalogFontSource, type FontSourceLimits } from './catalog-font-source.ts'
import type { FontCatalog } from './font-catalog.ts'
import type { FontSource } from './fonts.ts'
import { LimitExceededError } from './limits.ts'

export interface UrlFontSourceOptions {
  baseUrl?: string | URL
  fetch?: FontFetch
  limits?: FontSourceLimits
}

export type FontFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function displayUrl(url: URL): string {
  const display = new URL(url)
  display.username = ''
  display.password = ''
  display.search = ''
  display.hash = ''
  return display.href
}

function fontUrl(src: string, baseUrl: string | URL | undefined): URL {
  let url: URL
  try {
    url = new URL(src, baseUrl)
  } catch {
    throw new Error('The font URL src is invalid; provide an absolute src or a baseUrl to clear this refusal.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error(
      `The font URL ${JSON.stringify(displayUrl(url))} uses the ${JSON.stringify(url.protocol)} scheme; use an http: or https: src to clear this refusal.`,
    )
  return url
}

async function responseBytes(response: Response, url: string, limit: number, abort: () => void): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) {
      abort()
      throw new LimitExceededError('fontSource.each', bytes.byteLength, limit, { where: url, setting: 'limits.each' })
    }
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) {
        abort()
        throw new LimitExceededError('fontSource.each', length, limit, { where: url, setting: 'limits.each', atLeast: true })
      }
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function urlFontSource(catalog: FontCatalog, options: UrlFontSourceOptions = {}): FontSource {
  const fetchFont = options.fetch ?? globalThis.fetch
  return catalogFontSource(
    catalog,
    async (src, { signal, limit }) => {
      const url = fontUrl(src, options.baseUrl)
      const displayedUrl = displayUrl(url)
      const controller = new AbortController()
      const response = await fetchFont(url, { signal: AbortSignal.any([signal, controller.signal]) })
      if (!response.ok)
        throw new Error(
          `The font URL ${JSON.stringify(displayedUrl)} answered with status ${response.status}; make the font available with a successful response to clear this refusal.`,
        )
      return responseBytes(response, displayedUrl, limit, () => controller.abort())
    },
    { limits: options.limits },
  )
}
