import {
  type FontFace,
  type FontReference,
  LOCAL_FONT_LIMITS,
  type LocalFacesInput,
  LocalFaceTransport,
  type LocalFontLimits,
  localFontLimitRefusal,
  localFontReferences,
} from '@segnavia/format'
import { base64ToBytes, bytesToBase64, fontFormat } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'

export const DEFAULT_LOCAL_FONT_COUNT = LOCAL_FONT_LIMITS.count
export const DEFAULT_LOCAL_FONT_BYTES = LOCAL_FONT_LIMITS.bytes

export interface LocalFontsReport {
  fellBack: Array<{ family: string; fallback: string }>
}

export interface LocalFontsOptions {
  faces?: LocalFacesInput
  limits?: LocalFontLimits
  report?: (report: LocalFontsReport) => void
}

function familyFrom(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('family' in value)) return 'unknown family'
  const family = (value as { family?: unknown }).family
  return typeof family === 'string' && family.length > 0 ? family : 'unknown family'
}

function decodeFace(input: unknown): FontFace {
  const parsed = LocalFaceTransport.safeParse(input)
  const family = familyFrom(input)
  if (!parsed.success) {
    throw new RenderRefusedError(
      `The local face ${JSON.stringify(family)} has an invalid transport shape; send only family, format, weight, style and base64 data to clear this refusal.`,
    )
  }
  let data: Uint8Array | undefined
  try {
    data = base64ToBytes(parsed.data.data)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    throw new RenderRefusedError(`The local face ${JSON.stringify(family)} has invalid base64 data; send canonical base64 to clear this refusal.`)
  }
  if (!data || bytesToBase64(data) !== parsed.data.data) {
    throw new RenderRefusedError(`The local face ${JSON.stringify(family)} has invalid base64 data; send canonical base64 to clear this refusal.`)
  }
  const detected = fontFormat(data)
  if (detected !== parsed.data.format) {
    throw new RenderRefusedError(
      `The local face ${JSON.stringify(family)} declares ${parsed.data.format}, but its signature is ${detected ?? 'not a supported font'}; send a matching supported face to clear this refusal.`,
    )
  }
  return { ...parsed.data, data }
}

function decodedFaces(options: LocalFontsOptions | undefined): FontFace[] {
  const supplied: unknown = options?.faces ?? []
  if (!Array.isArray(supplied)) {
    throw new RenderRefusedError('The local faces transport is not an array; send an array of local faces to clear this refusal.')
  }
  const inputs: readonly unknown[] = supplied
  const refusal = localFontLimitRefusal(
    inputs.map((input) => {
      const data = typeof input === 'object' && input !== null && 'data' in input ? (input as { data?: unknown }).data : undefined
      if (typeof data !== 'string') return { family: familyFrom(input), bytes: 0 }
      const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
      return { family: familyFrom(input), bytes: (data.length / 4) * 3 - padding }
    }),
    options?.limits,
  )
  if (refusal) throw new RenderRefusedError(refusal)
  return inputs.map(decodeFace)
}

export function localFontsForRender(
  options: LocalFontsOptions | undefined,
  references: readonly FontReference[],
): { faces: FontFace[]; report: LocalFontsReport } {
  const decoded = decodedFaces(options)
  const locals = localFontReferences(references)
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
