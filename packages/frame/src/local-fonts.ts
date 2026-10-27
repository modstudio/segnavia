import type { FontFace, FontReference, LocalFacesInput } from '@segnavia/format'
import { bytesToBase64, fontFormat } from '@segnavia/html'

export type LocalFontUnavailableReason = 'unsupported' | 'denied' | 'not-installed' | 'unreadable'

export interface LocalFontUnavailable {
  family: string
  fallback: string
  reason: LocalFontUnavailableReason
}

export interface LocalFonts {
  faces: FontFace[]
  unavailable: LocalFontUnavailable[]
}

interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob(): Promise<Blob>
}

type QueryLocalFonts = () => Promise<LocalFontData[]>

const WEIGHT_NAMES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  roman: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
}

function localReferences(references: readonly FontReference[]): Array<{ local: string; fallback: string }> {
  const seen = new Set<string>()
  const locals: Array<{ local: string; fallback: string }> = []
  for (const ref of references) {
    if (!('local' in ref)) continue
    const key = JSON.stringify(ref)
    if (seen.has(key)) continue
    seen.add(key)
    locals.push({ local: ref.local, fallback: ref.fallback })
  }
  return locals
}

function unavailable(locals: Array<{ local: string; fallback: string }>, reason: LocalFontUnavailableReason): LocalFonts {
  return { faces: [], unavailable: locals.map((ref) => ({ family: ref.local, fallback: ref.fallback, reason })) }
}

function queryLocalFonts(): QueryLocalFonts | undefined {
  const query = (globalThis as { queryLocalFonts?: unknown }).queryLocalFonts
  return typeof query === 'function' ? (query as QueryLocalFonts) : undefined
}

function isAbort(error: unknown): boolean {
  return (error instanceof Error && error.name === 'AbortError') || (error instanceof DOMException && error.name === 'AbortError')
}

function cutKey(font: LocalFontData): string {
  if (font.postscriptName) return `postscript:${font.postscriptName}`
  if (font.fullName) return `full:${font.fullName}`
  return `style:${font.style}`
}

function faceWeightAndStyle(style: string): { weight: number; style: 'normal' | 'italic' } {
  const tokens = style.toLowerCase().split(/[\s-]+/)
  let weight = 400
  let italic = false
  for (const token of tokens) {
    if (token === 'italic' || token === 'oblique') italic = true
    const named = WEIGHT_NAMES[token]
    if (named !== undefined) weight = named
    else if (/^[1-9]00$/.test(token)) weight = Number(token)
  }
  return { weight, style: italic ? 'italic' : 'normal' }
}

async function readCut(font: LocalFontData, family: string, signal: AbortSignal): Promise<FontFace | undefined> {
  signal.throwIfAborted()
  try {
    const data = new Uint8Array(await (await font.blob()).arrayBuffer())
    const format = fontFormat(data)
    if (!format) return
    const cut = faceWeightAndStyle(font.style)
    return { family, data, format, weight: cut.weight, style: cut.style }
  } catch (error) {
    if (isAbort(error) || signal.aborted) throw error
  }
}

async function facesForFamily(family: string, installed: readonly LocalFontData[], signal: AbortSignal): Promise<{ faces: FontFace[]; unreadable: boolean }> {
  const faces: FontFace[] = []
  const seen = new Set<string>()
  let matched = false
  let unreadable = false
  const declared = family.toLowerCase()
  for (const font of installed) {
    if (font.family.toLowerCase() !== declared) continue
    matched = true
    const key = cutKey(font)
    if (seen.has(key)) continue
    seen.add(key)
    const face = await readCut(font, family, signal)
    if (face) faces.push(face)
    else unreadable = true
  }
  return { faces, unreadable: matched && faces.length === 0 && unreadable }
}

async function installedFonts(signal: AbortSignal): Promise<{ fonts?: LocalFontData[]; reason?: 'unsupported' | 'denied' }> {
  const query = queryLocalFonts()
  if (!query) return { reason: 'unsupported' }
  signal.throwIfAborted()
  try {
    const fonts = await query()
    signal.throwIfAborted()
    return { fonts }
  } catch (error) {
    if (isAbort(error) || signal.aborted) throw error
    return { reason: error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported' }
  }
}

export async function readLocalFonts(references: readonly FontReference[], options: { signal: AbortSignal }): Promise<LocalFonts> {
  const locals = localReferences(references)
  if (locals.length === 0) return { faces: [], unavailable: [] }
  const installed = await installedFonts(options.signal)
  if (installed.reason) return unavailable(locals, installed.reason)
  const fonts = installed.fonts ?? []
  const faces: FontFace[] = []
  const present = new Set<string>()
  const unreadable = new Set<string>()
  for (const ref of locals) {
    if (present.has(ref.local) || unreadable.has(ref.local)) continue
    const family = await facesForFamily(ref.local, fonts, options.signal)
    if (family.faces.length > 0) {
      faces.push(...family.faces)
      present.add(ref.local)
      continue
    }
    if (family.unreadable) unreadable.add(ref.local)
  }
  const unavailableFaces: LocalFontUnavailable[] = []
  for (const ref of locals) {
    if (present.has(ref.local)) continue
    unavailableFaces.push({ family: ref.local, fallback: ref.fallback, reason: unreadable.has(ref.local) ? 'unreadable' : 'not-installed' })
  }
  return { faces, unavailable: unavailableFaces }
}

export function packLocalFaces(faces: readonly FontFace[], references: readonly FontReference[]): LocalFacesInput {
  const families = new Map<string, string>()
  for (const reference of references) {
    if ('local' in reference && !families.has(reference.local.toLowerCase())) families.set(reference.local.toLowerCase(), reference.local)
  }
  return faces.flatMap((face) => {
    const family = families.get(face.family.toLowerCase())
    if (!family) return []
    return [{ family, format: face.format, weight: face.weight, style: face.style, data: bytesToBase64(face.data) }]
  })
}
