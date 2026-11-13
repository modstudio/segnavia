import { type FontFailure, type FontManifest, type FontWeight, fontCoverageGaps, HEBREW_UNICODE_RANGE, rangeSample } from '@segnavia/format'

export const FONT_FAILURE_ATTRIBUTE = 'data-segnavia-font-failures'
export const FONT_FAILURE_LIMIT = 64
export const FONT_FAILURE_FIELD_LIMIT = 256

export interface DeclaredFontLoad {
  font: string
  weight?: FontWeight
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
  unicodeRange?: string
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
  coverageGaps: typeof fontCoverageGaps = fontCoverageGaps,
): Promise<FontFailure[]> {
  const available = Array.from(faces)
  const failures: FontFailure[] = []
  for (const declaration of declarations) {
    const family = familyValue(declaration.font).slice(0, fieldLimit)
    const wholeGap = JSON.stringify(coverageGaps(declaration, []))
    const intersecting = available.filter(
      (candidate) => candidate.family.replace(/^['"]|['"]$/g, '') === family && JSON.stringify(coverageGaps(declaration, [candidate])) !== wholeGap,
    )
    const loaded = await Promise.all(
      intersecting.map(async (face) => {
        try {
          // FontFace.load fetches the face's source whatever text it receives, so this exercises every intersecting face.
          await face.load(declaration.sample)
          return face.status !== 'error' ? face : undefined
        } catch {
          return undefined
        }
      }),
    )
    const gaps = coverageGaps(
      declaration,
      loaded.filter((face) => face !== undefined),
    )
    for (const gap of gaps) {
      if (failures.length >= failureLimit) break
      failures.push({
        font: declaration.font.slice(0, fieldLimit),
        family,
        weight: gap.weight,
        ...(gap.style === undefined ? {} : { style: gap.style }),
        ...(gap.unicodeRange === undefined ? {} : { unicodeRange: gap.unicodeRange.slice(0, fieldLimit) }),
        reason: 'unloaded',
      })
    }
  }
  root.setAttribute(failureAttribute, JSON.stringify(failures))
  return failures
}

/** Builds the shared in-frame expression that loads every declared face. */
export function declaredFontLoadExpression(declarations: string): string {
  return `(!document.fonts||!${declarations}.length?Promise.resolve([]):(${loadDeclaredFonts.toString()})(${declarations},document.fonts,document.documentElement,function(font){var value=getComputedStyle(document.documentElement).getPropertyValue('--segnavia-font-'+font).trim();var family=(value.split(',')[0]||font).trim();return family.replace(/^['"]|['"]$/g,'');},'${FONT_FAILURE_ATTRIBUTE}',${FONT_FAILURE_LIMIT},${FONT_FAILURE_FIELD_LIMIT},(${fontCoverageGaps.toString()})))`
}

function boundedField(value: unknown, optional = false): boolean {
  if (optional && value === undefined) return true
  return (typeof value === 'string' || typeof value === 'number') && String(value).length <= FONT_FAILURE_FIELD_LIMIT
}

function boundedWeight(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 1000
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 1 && part <= 1000) &&
    (value[0] as number) <= (value[1] as number)
  )
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
        !boundedWeight((failure as FontFailure).weight) ||
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
