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

function fontUrl(src: string, baseUrl: string | URL | undefined): string {
  try {
    return new URL(src, baseUrl).href
  } catch {
    throw new Error(`The font URL ${JSON.stringify(src)} is invalid; provide an absolute src or a baseUrl to clear this refusal.`)
  }
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
      const controller = new AbortController()
      const response = await fetchFont(url, { signal: AbortSignal.any([signal, controller.signal]) })
      if (!response.ok)
        throw new Error(
          `The font URL ${JSON.stringify(url)} answered with status ${response.status}; make the font available with a successful response to clear this refusal.`,
        )
      return responseBytes(response, url, limit, () => controller.abort())
    },
    { limits: options.limits },
  )
}
