import { type FontFailure, type FontManifest, HEBREW_UNICODE_RANGE, type PreflightEntry, rangeSample } from '@segnavia/format'

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

export function fontMissingEntries(failures: readonly FontFailure[]): PreflightEntry[] {
  return failures.map((failure) => {
    const details = [failure.weight === undefined ? undefined : `weight ${failure.weight}`, failure.style].filter(Boolean)
    const subject = details.length === 0 ? failure.family : `${failure.family} (${details.join(', ')})`
    return {
      check: 'font-missing',
      subject,
      message: `Font face ${subject} is missing; supply and load that face to clear it.`,
    }
  })
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
): Promise<FontFailure[]> {
  const available = Array.from(faces)
  const failures: FontFailure[] = []
  const normalizedWeight = (value: string | number | undefined) => {
    if (value === undefined || value === 'normal') return '400'
    if (value === 'bold') return '700'
    return String(value)
  }
  const parsedRange = (value: string | undefined): [number, number][] | null => {
    if (value === undefined) return []
    const parts: [number, number][] = []
    for (const raw of value.split(',')) {
      const match = /^\s*U\+([\dA-F?]{1,6})(?:-([\dA-F]{1,6}))?\s*$/i.exec(raw)
      if (!match) return null
      const rangeStart = match[1]
      if (rangeStart === undefined) return null
      const start = Number.parseInt(rangeStart.replace(/\?/g, '0'), 16)
      const end = Number.parseInt(match[2] ?? rangeStart.replace(/\?/g, 'F'), 16)
      parts.push([start, end])
    }
    return parts.sort(([leftStart, leftEnd], [rightStart, rightEnd]) => leftStart - rightStart || leftEnd - rightEnd)
  }
  const rangesMatch = (candidate: string | undefined, declaration: string | undefined) => {
    const candidateParts = parsedRange(candidate)
    if (candidateParts === null) return false
    const firstCandidate = candidateParts[0]
    if (firstCandidate === undefined || (candidateParts.length === 1 && firstCandidate[0] === 0 && firstCandidate[1] === 0x10ffff)) return true
    const declarationParts = parsedRange(declaration)
    return (
      declarationParts !== null &&
      candidateParts.length === declarationParts.length &&
      candidateParts.every(([start, end], index) => {
        const declared = declarationParts[index]
        return declared !== undefined && start === declared[0] && end === declared[1]
      })
    )
  }
  for (const declaration of declarations) {
    const family = familyValue(declaration.font).slice(0, fieldLimit)
    const face = available.find(
      (candidate) =>
        candidate.family.replace(/^['"]|['"]$/g, '') === family &&
        normalizedWeight(candidate.weight) === normalizedWeight(declaration.weight) &&
        (candidate.style || 'normal') === (declaration.style ?? 'normal') &&
        rangesMatch(candidate.unicodeRange, declaration.unicodeRange),
    )
    if (face) await face.load(declaration.sample).catch(() => undefined)
    if (face && face.status !== 'error') continue
    if (failures.length < failureLimit)
      failures.push({
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

/** Builds the shared in-frame expression that loads every declared face. */
export function declaredFontLoadExpression(declarations: string): string {
  return `(!document.fonts||!${declarations}.length?Promise.resolve([]):(${loadDeclaredFonts.toString()})(${declarations},document.fonts,document.documentElement,function(font){var value=getComputedStyle(document.documentElement).getPropertyValue('--segnavia-font-'+font).trim();var family=(value.split(',')[0]||font).trim();return family.replace(/^['"]|['"]$/g,'');},'${FONT_FAILURE_ATTRIBUTE}',${FONT_FAILURE_LIMIT},${FONT_FAILURE_FIELD_LIMIT}))`
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
