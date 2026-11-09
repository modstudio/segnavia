import {
  type FontFace,
  FontFaceRefusedError,
  type FontReference,
  type LocalFacesInput,
  LocalFaceTransport,
  localFontLimitExceeded,
  localFontReferences,
  type ResolvedFontFace,
  type ResolvedLimits,
  resolveFontFace,
} from '@segnavia/format'
import { base64ToBytes, bytesToBase64, fontFormat } from '@segnavia/html'
import { RenderLimitError, RenderRefusedError } from './errors.ts'

export interface LocalFontsReport {
  fellBack: Array<{ family: string; fallback: string }>
}

export interface LocalFontsOptions {
  faces?: LocalFacesInput
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
      `The local face ${JSON.stringify(family)} has an invalid transport shape; send only family, format, weight, style, postscriptName and base64 data to clear this refusal.`,
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
  let resolved: ResolvedFontFace
  try {
    resolved = resolveFontFace(data, parsed.data.format, parsed.data.postscriptName)
  } catch (error) {
    if (error instanceof FontFaceRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
  const detected = fontFormat(resolved.data)
  if (detected !== resolved.format) {
    throw new RenderRefusedError(
      `The local face ${JSON.stringify(family)} declares ${resolved.format}, but its signature is ${detected ?? 'not a supported font'}; send a matching supported face to clear this refusal.`,
    )
  }
  const { postscriptName: _postscriptName, ...face } = parsed.data
  return { ...face, ...resolved }
}

function decodedFaces(options: LocalFontsOptions | undefined, limits: ResolvedLimits['localFonts']): FontFace[] {
  const supplied: unknown = options?.faces ?? []
  if (!Array.isArray(supplied)) {
    throw new RenderRefusedError('The local faces transport is not an array; send an array of local faces to clear this refusal.')
  }
  const inputs: readonly unknown[] = supplied
  const exceeded = localFontLimitExceeded(
    inputs.map((input) => {
      const data = typeof input === 'object' && input !== null && 'data' in input ? (input as { data?: unknown }).data : undefined
      if (typeof data !== 'string') return { family: familyFrom(input), bytes: 0 }
      const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
      return { family: familyFrom(input), bytes: (data.length / 4) * 3 - padding }
    }),
    limits,
  )
  if (exceeded) throw new RenderLimitError([exceeded])
  const faces = inputs.map(decodeFace)
  const extractedExceeded = localFontLimitExceeded(
    faces.map((face) => ({ family: face.family, bytes: face.data.length })),
    limits,
  )
  if (extractedExceeded) throw new RenderLimitError([extractedExceeded])
  return faces
}

export function localFontsForRender(
  options: LocalFontsOptions | undefined,
  references: readonly FontReference[],
  limits: ResolvedLimits['localFonts'],
): { faces: FontFace[]; report: LocalFontsReport } {
  const decoded = decodedFaces(options, limits)
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
