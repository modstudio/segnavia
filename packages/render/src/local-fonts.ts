import { type FontFace, type FontReference, type LocalFacesInput, LocalFaceTransport } from '@segnavia/format'
import { base64ToBytes, bytesToBase64, fontFormat } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'

export const DEFAULT_LOCAL_FONT_COUNT = 16
export const DEFAULT_LOCAL_FONT_BYTES = 32 * 1024 * 1024

export interface LocalFontsReport {
  fellBack: Array<{ family: string; fallback: string }>
}

export interface LocalFontsOptions {
  faces?: LocalFacesInput
  limits?: { count?: number; bytes?: number }
  report?: (report: LocalFontsReport) => void
}

function familyFrom(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('family' in value)) return 'unknown family'
  const family = (value as { family?: unknown }).family
  return typeof family === 'string' && family.length > 0 ? family : 'unknown family'
}

function limit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RenderRefusedError(`The local font ${label} limit must be a non-negative safe integer; supply a valid limit to clear this refusal.`)
  }
  return resolved
}

function decodedFaces(options: LocalFontsOptions | undefined): FontFace[] {
  const supplied: unknown = options?.faces ?? []
  if (!Array.isArray(supplied)) {
    throw new RenderRefusedError('The local faces transport is not an array; send an array of local faces to clear this refusal.')
  }
  const inputs: readonly unknown[] = supplied
  const countLimit = limit(options?.limits?.count, DEFAULT_LOCAL_FONT_COUNT, 'count')
  const byteLimit = limit(options?.limits?.bytes, DEFAULT_LOCAL_FONT_BYTES, 'byte')
  if (inputs.length > countLimit) {
    throw new RenderRefusedError(
      `The local face ${JSON.stringify(familyFrom(inputs[countLimit]))} exceeds the count limit of ${countLimit}; send at most ${countLimit} faces to clear this refusal.`,
    )
  }
  const faces: FontFace[] = []
  let bytes = 0
  for (const input of inputs) {
    const parsed = LocalFaceTransport.safeParse(input)
    const family = familyFrom(input)
    if (!parsed.success) {
      throw new RenderRefusedError(
        `The local face ${JSON.stringify(family)} has an invalid transport shape; send only family, format, weight, style and base64 data to clear this refusal.`,
      )
    }
    const data = base64ToBytes(parsed.data.data)
    if (!data || bytesToBase64(data) !== parsed.data.data) {
      throw new RenderRefusedError(`The local face ${JSON.stringify(family)} has invalid base64 data; send canonical base64 to clear this refusal.`)
    }
    bytes += data.byteLength
    if (bytes > byteLimit) {
      throw new RenderRefusedError(
        `The local face ${JSON.stringify(family)} exceeds the byte limit of ${byteLimit}; send at most ${byteLimit} decoded bytes to clear this refusal.`,
      )
    }
    const detected = fontFormat(data)
    if (detected !== parsed.data.format) {
      throw new RenderRefusedError(
        `The local face ${JSON.stringify(family)} declares ${parsed.data.format}, but its signature is ${detected ?? 'not a supported font'}; send a matching supported face to clear this refusal.`,
      )
    }
    faces.push({ ...parsed.data, data })
  }
  return faces
}

function localReferences(references: readonly FontReference[]): Array<{ local: string; fallback: string }> {
  const seen = new Set<string>()
  const locals: Array<{ local: string; fallback: string }> = []
  for (const reference of references) {
    if (!('local' in reference)) continue
    const key = JSON.stringify(reference)
    if (seen.has(key)) continue
    seen.add(key)
    locals.push(reference)
  }
  return locals
}

export function localFontsForRender(
  options: LocalFontsOptions | undefined,
  references: readonly FontReference[],
): { faces: FontFace[]; report: LocalFontsReport } {
  const decoded = decodedFaces(options)
  const locals = localReferences(references)
  const declared = new Map(locals.map((reference) => [reference.local.toLowerCase(), reference.local]))
  const faces = decoded.flatMap((face) => {
    const family = declared.get(face.family.toLowerCase())
    return family ? [{ ...face, family }] : []
  })
  const present = new Set(faces.map((face) => face.family.toLowerCase()))
  return {
    faces,
    report: {
      fellBack: locals.filter((reference) => !present.has(reference.local.toLowerCase())).map(({ local: family, fallback }) => ({ family, fallback })),
    },
  }
}
