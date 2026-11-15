import { FontCatalog } from './font-catalog.ts'
import { classifyFont } from './font-signature.ts'
import type { AppFont, FontFace, FontSource } from './fonts.ts'
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

function loadedFace(
  entry: ReturnType<typeof FontCatalog.parse>[string],
  index: number,
  face: ReturnType<typeof FontCatalog.parse>[string]['faces'][number],
  data: Uint8Array,
): FontFace {
  const detected = classifyFont(data)
  if (detected === undefined) throw faceRefusal(entry.family, index, face.src, 'is not a supported font')
  if (detected !== face.format) throw faceRefusal(entry.family, index, face.src, `declares ${face.format}, but its signature is ${detected}`)
  return {
    family: entry.family,
    data,
    format: face.format,
    ...(face.weight === undefined ? {} : { weight: Array.isArray(face.weight) ? `${face.weight[0]} ${face.weight[1]}` : face.weight }),
    ...(face.style === undefined ? {} : { style: face.style }),
    ...(face.unicodeRange === undefined ? {} : { unicodeRange: face.unicodeRange }),
    ...(face.postscriptName === undefined ? {} : { postscriptName: face.postscriptName }),
  }
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
    faces.push(loadedFace(entry, index, face, data))
  }
  return { family: entry.family, faces, ...(entry.generic === undefined ? {} : { generic: entry.generic }) }
}

export function catalogFontSource(catalogInput: FontCatalog, load: CatalogFontLoad, options: { limits?: FontSourceLimits } = {}): FontSource {
  const catalog = FontCatalog.parse(catalogInput)
  const limits = resolvedLimits(options.limits)
  const cache = new Map<string, Promise<AppFont>>()
  const loadSignal = new AbortController().signal

  function forCaller<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason)
    return new Promise((resolve, reject) => {
      const aborted = () => reject(signal.reason)
      signal.addEventListener('abort', aborted, { once: true })
      promise.then(
        (value) => {
          signal.removeEventListener('abort', aborted)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', aborted)
          reject(error)
        },
      )
    })
  }

  return {
    font(name, { signal }) {
      const entry = Object.hasOwn(catalog, name) ? catalog[name] : undefined
      if (!entry) return Promise.resolve(undefined)
      const present = cache.get(name)
      if (present) return forCaller(present, signal)
      const loading = loadCatalogFont(entry, load, limits, loadSignal)
      cache.set(name, loading)
      loading.catch(() => {
        if (cache.get(name) === loading) cache.delete(name)
      })
      return forCaller(loading, signal)
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
