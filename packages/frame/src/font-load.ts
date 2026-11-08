import { type FontFailure, type FontManifest, HEBREW_UNICODE_RANGE, rangeSample } from '@segnavia/format'

export const FONT_FAILURE_ATTRIBUTE = 'data-segnavia-font-failures'
export const FONT_FAILURE_LIMIT = 64
export const FONT_FAILURE_FIELD_LIMIT = 256

export interface DeclaredFontLoad {
  font: string
  weight?: number
  style?: 'normal' | 'italic'
  unicodeRange?: string
  sample: string
}

export function declaredFontLoads(fonts: FontManifest | undefined): DeclaredFontLoad[] {
  return Object.entries(fonts ?? {}).flatMap(([font, entry]) =>
    'faces' in entry
      ? entry.faces.map(({ script, ...face }) => ({
          font,
          ...face,
          ...(script === 'hebrew' && face.unicodeRange === undefined ? { unicodeRange: HEBREW_UNICODE_RANGE } : {}),
          sample: rangeSample(face.unicodeRange ?? (script === 'hebrew' ? HEBREW_UNICODE_RANGE : undefined)),
        }))
      : [],
  )
}

type LoadableFace = {
  family: string
  weight: string
  style: string
  status: string
  load(sample?: string): Promise<unknown>
}

/** Runs inside a sandboxed author frame; keep this function self-contained so the bridge can embed it. */
export async function loadDeclaredFonts(
  declarations: DeclaredFontLoad[],
  faces: Iterable<LoadableFace>,
  root: { setAttribute(name: string, value: string): void },
  familyValue: (font: string) => string,
  failureAttribute: string,
  failureLimit: number,
  fieldLimit: number,
): Promise<FontFailure[]> {
  const available = Array.from(faces)
  const failures: FontFailure[] = []
  const normalizedWeight = (value: string | number | undefined) => {
    if (value === undefined || value === 'normal') return '400'
    if (value === 'bold') return '700'
    return String(value)
  }
  for (const declaration of declarations) {
    const family = familyValue(declaration.font).slice(0, fieldLimit)
    const face = available.find(
      (candidate) =>
        candidate.family.replace(/^['"]|['"]$/g, '') === family &&
        normalizedWeight(candidate.weight) === normalizedWeight(declaration.weight) &&
        (candidate.style || 'normal') === (declaration.style ?? 'normal'),
    )
    if (face) await face.load(declaration.sample).catch(() => undefined)
    if (face && face.status !== 'error') continue
    if (failures.length < failureLimit) failures.push({
      font: declaration.font.slice(0, fieldLimit),
      family,
      ...(declaration.weight === undefined ? {} : { weight: declaration.weight }),
      ...(declaration.style === undefined ? {} : { style: declaration.style }),
      ...(declaration.unicodeRange === undefined ? {} : { unicodeRange: declaration.unicodeRange.slice(0, fieldLimit) }),
      reason: 'unloaded',
    })
  }
  root.setAttribute(failureAttribute, JSON.stringify(failures))
  return failures
}

function boundedField(value: unknown, optional = false): boolean {
  if (optional && value === undefined) return true
  return (typeof value === 'string' || typeof value === 'number') && String(value).length <= FONT_FAILURE_FIELD_LIMIT
}

/** Validates the whole report before accepting any entry. */
export function fontFailuresData(value: unknown): FontFailure[] | null {
  if (!Array.isArray(value) || value.length > FONT_FAILURE_LIMIT) return null
  if (
    value.some(
      (failure) =>
        !failure ||
        typeof failure !== 'object' ||
        !boundedField((failure as FontFailure).font) ||
        !boundedField((failure as FontFailure).family) ||
        !boundedField((failure as FontFailure).weight, true) ||
        !boundedField((failure as FontFailure).style, true) ||
        !boundedField((failure as FontFailure).unicodeRange, true) ||
        !['unsupplied', 'unloaded'].includes((failure as FontFailure).reason),
    )
  )
    return null
  return value.map((raw) => {
    const failure = raw as FontFailure
    return {
      font: failure.font,
      family: failure.family,
      ...(failure.weight === undefined ? {} : { weight: failure.weight }),
      ...(failure.style === undefined ? {} : { style: failure.style }),
      ...(failure.unicodeRange === undefined ? {} : { unicodeRange: failure.unicodeRange }),
      reason: failure.reason,
    }
  })
}

export function fontFailuresAttribute(value: string | null): FontFailure[] {
  if (!value) return []
  try {
    return fontFailuresData(JSON.parse(value)) ?? []
  } catch {
    return []
  }
}

export function boundedFontReportMessage(
  data: { type?: unknown; text?: unknown; failures?: unknown },
  types: { composeFailure: string; fontFailures: string },
  composeFailureLimit: number,
): { type: string; text?: string; failures?: FontFailure[] } | null {
  if (data.type === types.composeFailure && typeof data.text === 'string' && data.text.length > 0 && data.text.length <= composeFailureLimit)
    return { type: types.composeFailure, text: data.text }
  if (data.type !== types.fontFailures) return null
  const failures = fontFailuresData(data.failures)
  return failures ? { type: types.fontFailures, failures } : null
}
