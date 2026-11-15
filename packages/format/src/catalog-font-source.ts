import { FontCatalog } from './font-catalog.ts'
import { classifyFont } from './font-signature.ts'
import type { AppFont, FontSource } from './fonts.ts'
import { LimitExceededError } from './limits.ts'

const DEFAULT_EACH_LIMIT = 16 * 1024 * 1024
const DEFAULT_FAMILY_LIMIT = 32 * 1024 * 1024

export interface FontSourceLimits {
  each?: number
  bytes?: number
}

export interface CatalogFontLoadOptions {
  signal: AbortSignal
  limit: number
}

export type CatalogFontLoad = (src: string, options: CatalogFontLoadOptions) => Promise<Uint8Array>

function resolvedLimits(limits: FontSourceLimits | undefined): { each: number; bytes: number } {
  const each = limits?.each ?? DEFAULT_EACH_LIMIT
  const bytes = limits?.bytes ?? DEFAULT_FAMILY_LIMIT
  for (const [name, value] of Object.entries({ each, bytes })) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`The font source ${name} limit must be a non-negative safe integer; pass a valid ${name} limit to clear this refusal.`)
  }
  return { each, bytes }
}

function faceRefusal(family: string, index: number, src: string, detail: string): Error {
  return new Error(
    `The font ${JSON.stringify(family)} face ${index} from ${JSON.stringify(src)} ${detail}; correct the catalog or font file to clear this refusal.`,
  )
}

async function loadCatalogFont(
  entry: ReturnType<typeof FontCatalog.parse>[string],
  load: CatalogFontLoad,
  limits: { each: number; bytes: number },
  signal: AbortSignal,
): Promise<AppFont> {
  let total = 0
  const faces = []
  for (const [index, face] of entry.faces.entries()) {
    const data = await load(face.src, { signal, limit: limits.each })
    if (!(data instanceof Uint8Array)) throw faceRefusal(entry.family, index, face.src, 'did not load as bytes')
    if (data.byteLength > limits.each)
      throw new LimitExceededError('fontSource.each', data.byteLength, limits.each, {
        where: `${JSON.stringify(entry.family)} face ${index} (${face.src})`,
        setting: 'limits.each',
      })
    total += data.byteLength
    if (total > limits.bytes)
      throw new LimitExceededError('fontSource.bytes', total, limits.bytes, {
        where: JSON.stringify(entry.family),
        setting: 'limits.bytes',
      })
    const detected = classifyFont(data)
    if (detected === undefined) throw faceRefusal(entry.family, index, face.src, 'is not a supported font')
    if (detected !== face.format) throw faceRefusal(entry.family, index, face.src, `declares ${face.format}, but its signature is ${detected}`)
    faces.push({ ...face, family: entry.family, data })
  }
  return { family: entry.family, faces, ...(entry.generic === undefined ? {} : { generic: entry.generic }) }
}

export function catalogFontSource(catalogInput: FontCatalog, load: CatalogFontLoad, options: { limits?: FontSourceLimits } = {}): FontSource {
  const catalog = FontCatalog.parse(catalogInput)
  const limits = resolvedLimits(options.limits)
  const cache = new Map<string, Promise<AppFont>>()

  return {
    font(name, { signal }) {
      const entry = catalog[name]
      if (!entry) return Promise.resolve(undefined)
      const present = cache.get(name)
      if (present) return present
      const loading = loadCatalogFont(entry, load, limits, signal)
      cache.set(name, loading)
      loading.catch(() => {
        if (cache.get(name) === loading) cache.delete(name)
      })
      return loading
    },
  }
}

export function fontSources(...sources: readonly FontSource[]): FontSource {
  return {
    async font(name, options) {
      for (const source of sources) {
        const font = await source.font(name, options)
        if (font !== undefined) return font
      }
    },
  }
}
