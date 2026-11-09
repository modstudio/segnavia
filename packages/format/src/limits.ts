import { z } from 'zod'

const TOP_LEVEL_LIMITS = [
  { measure: 'pages', subject: 'composed flow', unit: 'papers' },
  { measure: 'sheets', subject: 'PDF', unit: 'sheets' },
  { measure: 'bytes', subject: 'output file', unit: 'bytes' },
  { measure: 'slides', subject: 'deck', unit: 'slides' },
  { measure: 'slideBytes', subject: 'slide', unit: 'UTF-8 bytes' },
  { measure: 'notesBytes', subject: 'slide notes', unit: 'UTF-8 bytes' },
  { measure: 'descriptionTextChars', subject: 'concise document description block text', unit: 'Unicode code points' },
] as const

const LOCAL_FONT_LIMITS = [
  { measure: 'count', subject: 'local fonts', unit: 'faces' },
  { measure: 'bytes', subject: 'local fonts', unit: 'decoded bytes' },
] as const

const ASSET_LIMITS = [
  { measure: 'bytes', subject: 'document assets', unit: 'bytes' },
  { measure: 'each', subject: 'asset', unit: 'bytes' },
] as const

type TopLevelMeasure = (typeof TOP_LEVEL_LIMITS)[number]['measure']
type LocalFontMeasure = (typeof LOCAL_FONT_LIMITS)[number]['measure']
type AssetMeasure = (typeof ASSET_LIMITS)[number]['measure']

export type Limits = Partial<Record<TopLevelMeasure, number>> & {
  localFonts?: Partial<Record<LocalFontMeasure, number>>
  assets?: Partial<Record<AssetMeasure, number>>
}

export type DocumentLimits = Pick<Limits, 'pages' | 'descriptionTextChars'>
export type LimitMeasure = TopLevelMeasure | `localFonts.${LocalFontMeasure}` | `assets.${AssetMeasure}`
export type PageLimitSource = 'document' | 'default' | 'host'

export interface ResolvedLimits extends Limits {
  pages: number
  pagesSource: PageLimitSource
  descriptionTextChars: number
  localFonts: Record<LocalFontMeasure, number>
  assets: Record<AssetMeasure, number>
}

export const DEFAULT_PAGE_LIMIT = 500

export const DEFAULT_LIMITS = {
  pages: DEFAULT_PAGE_LIMIT,
  descriptionTextChars: 240,
  localFonts: { count: 64, bytes: 32 * 1024 * 1024 },
  assets: { bytes: 50 * 1024 * 1024, each: 10 * 1024 * 1024 },
} as const satisfies Pick<ResolvedLimits, 'pages' | 'descriptionTextChars' | 'localFonts' | 'assets'>

const REMOVED_LIMIT_NAMES: Record<string, string> = {
  maxSheets: 'limits.sheets',
  maxBytes: 'limits.bytes',
  maxSlides: 'limits.slides',
  maxSlideBytes: 'limits.slideBytes',
  maxNotesBytes: 'limits.notesBytes',
  'localFonts.limits': 'limits.localFonts',
}

const TOP_LEVEL_MEASURES = TOP_LEVEL_LIMITS.map(({ measure }) => measure)
const LOCAL_FONT_MEASURES = LOCAL_FONT_LIMITS.map(({ measure }) => measure)
const ASSET_MEASURES = ASSET_LIMITS.map(({ measure }) => measure)

function invalidInteger(value: unknown): boolean {
  return typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
}

function integerMessage(subject: string, field: string): string {
  return `The ${subject} ${field} limit must be a non-negative safe integer; pass a valid ${field} limit to clear this refusal.`
}

function unknownMessage(subject: string, field: string): string {
  const replacement = REMOVED_LIMIT_NAMES[field]
  const action = replacement ? `use ${replacement}` : `remove the unknown ${field} setting`
  return `The ${subject} limits include ${field}, which is not a current limit; ${action} to clear this refusal.`
}

function documentLimits(value: unknown, ctx: z.RefinementCtx): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  for (const key of Object.keys(source)) {
    if (key === 'pages' || key === 'descriptionTextChars') continue
    const field = `limits.${key}`
    const hostLimit = key === 'localFonts' || key === 'assets' || TOP_LEVEL_MEASURES.includes(key as TopLevelMeasure)
    ctx.addIssue({
      code: 'custom',
      path: [key],
      message: hostLimit
        ? `${field} is a host limit; remove it from the document and pass it in the host limits to clear this refusal.`
        : unknownMessage('document', REMOVED_LIMIT_NAMES[key] ? key : field),
    })
  }
  if (source.pages !== undefined && invalidInteger(source.pages)) {
    ctx.addIssue({ code: 'custom', path: ['pages'], message: integerMessage('document', 'limits.pages') })
  }
  if (source.descriptionTextChars !== undefined && invalidInteger(source.descriptionTextChars)) {
    ctx.addIssue({ code: 'custom', path: ['descriptionTextChars'], message: integerMessage('document', 'limits.descriptionTextChars') })
  }
  return {
    ...(source.pages === undefined ? {} : { pages: source.pages }),
    ...(source.descriptionTextChars === undefined ? {} : { descriptionTextChars: source.descriptionTextChars }),
  }
}

export const DocumentLimitsValue = z.preprocess(documentLimits, z.object({ pages: z.number().optional(), descriptionTextChars: z.number().optional() }))

export function resolveLimits(document: DocumentLimits | undefined, host: Limits | undefined): ResolvedLimits {
  const documentPages = document?.pages ?? DEFAULT_LIMITS.pages
  const hostBinds = host?.pages !== undefined && host.pages < documentPages
  return {
    ...host,
    pages: hostBinds ? (host.pages as number) : documentPages,
    pagesSource: hostBinds ? 'host' : document?.pages === undefined ? 'default' : 'document',
    descriptionTextChars: Math.min(
      document?.descriptionTextChars ?? DEFAULT_LIMITS.descriptionTextChars,
      host?.descriptionTextChars ?? Number.POSITIVE_INFINITY,
    ),
    localFonts: {
      count: host?.localFonts?.count ?? DEFAULT_LIMITS.localFonts.count,
      bytes: host?.localFonts?.bytes ?? DEFAULT_LIMITS.localFonts.bytes,
    },
    assets: {
      bytes: host?.assets?.bytes ?? DEFAULT_LIMITS.assets.bytes,
      each: host?.assets?.each ?? DEFAULT_LIMITS.assets.each,
    },
  }
}

function parsedInteger(value: unknown, field: string, subject: string): number {
  if (invalidInteger(value)) throw new RangeError(integerMessage(subject, field))
  return value as number
}

function refuseUnknownKeys(source: Record<string, unknown>, allowed: readonly string[], subject: string, prefix = 'limits'): void {
  const unknown = Object.keys(source).filter((key) => !allowed.includes(key))
  if (unknown.length === 0) return
  const messages = unknown.map((key) => unknownMessage(subject, prefix === 'limits' ? key : `${prefix}.${key}`))
  throw new RangeError(messages.join(' '))
}

function parsedNestedLimits<T extends string>(
  value: unknown,
  measures: readonly T[],
  subject: string,
  prefix: 'localFonts' | 'assets',
): Partial<Record<T, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RangeError(`The ${subject} limits.${prefix} limit must be an object; pass valid limits.${prefix} to clear this refusal.`)
  }
  const source = value as Record<string, unknown>
  refuseUnknownKeys(source, measures, subject, prefix)
  const parsed: Partial<Record<T, number>> = {}
  for (const measure of measures) {
    if (source[measure] !== undefined) parsed[measure] = parsedInteger(source[measure], `limits.${prefix}.${measure}`, subject)
  }
  return parsed
}

export function parseLimits(input: unknown, subject: string): Limits | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RangeError(`The ${subject} limits must be an object; pass valid limits to clear this refusal.`)
  }
  const source = input as Record<string, unknown>
  refuseUnknownKeys(source, [...TOP_LEVEL_MEASURES, 'localFonts', 'assets'], subject)
  const parsed: Limits = {}
  for (const measure of TOP_LEVEL_MEASURES) {
    if (source[measure] !== undefined) parsed[measure] = parsedInteger(source[measure], `limits.${measure}`, subject)
  }
  if (source.localFonts !== undefined) {
    parsed.localFonts = parsedNestedLimits(source.localFonts, LOCAL_FONT_MEASURES, subject, 'localFonts')
  }
  if (source.assets !== undefined) {
    parsed.assets = parsedNestedLimits(source.assets, ASSET_MEASURES, subject, 'assets')
  }
  return parsed
}

const TEXT = Object.fromEntries(
  [
    ...TOP_LEVEL_LIMITS,
    ...LOCAL_FONT_LIMITS.map(({ measure, ...text }) => ({ measure: `localFonts.${measure}`, ...text })),
    ...ASSET_LIMITS.map(({ measure, ...text }) => ({ measure: `assets.${measure}`, ...text })),
  ].map(({ measure, ...text }) => [measure, text]),
) as Record<LimitMeasure, { subject: string; unit: string }>

const PAGE_CLEAR: Record<PageLimitSource, string> = {
  document: 'declare a higher limits.pages on the document, or shorten the content',
  default: 'declare a higher limits.pages on the document, or shorten the content',
  host: "raise the host's limits.pages, or shorten the content",
}

export interface LimitRefusalOptions {
  where?: string
  pagesSource?: PageLimitSource
  setting?: string
  /** The actual is a lower bound: the measurement stopped once it passed the limit. */
  atLeast?: boolean
}

export const LIMIT_ACTUAL_PLACEHOLDER = '{{limit.actual}}'

function clearingAction(measure: LimitMeasure, options: LimitRefusalOptions): string {
  if (measure === 'pages') return PAGE_CLEAR[options.pagesSource ?? 'document']
  const setting = options.setting ?? `limits.${measure}`
  return `raise the host's ${setting}, or reduce the content`
}

function refusal(measure: LimitMeasure, actual: string | number, limit: number, options: LimitRefusalOptions): string {
  const text = TEXT[measure]
  const subject = options.where ? `${text.subject} for ${options.where}` : text.subject
  return `The ${subject} is ${options.atLeast ? 'at least ' : ''}${actual} ${text.unit}, above the ${measure} limit of ${limit}; ${clearingAction(measure, options)} to clear this refusal.`
}

export function limitRefusal(measure: LimitMeasure, actual: number, limit: number, options: LimitRefusalOptions = {}): string {
  return refusal(measure, actual, limit, options)
}

export function limitRefusalTemplate(measure: LimitMeasure, limit: number, options: LimitRefusalOptions = {}): string {
  return refusal(measure, LIMIT_ACTUAL_PLACEHOLDER, limit, options)
}

export function fillLimitRefusal(template: string, actual: number): string {
  return template.split(LIMIT_ACTUAL_PLACEHOLDER).join(String(actual))
}

export interface LocalFontLimitFace {
  family: string
  bytes: number
}

export function localFontLimitRefusal(faces: readonly LocalFontLimitFace[], limits: ResolvedLimits['localFonts']): string | undefined {
  if (faces.length > limits.count)
    return limitRefusal('localFonts.count', faces.length, limits.count, { where: JSON.stringify(faces[limits.count]?.family ?? 'unknown family') })
  let bytes = 0
  for (const face of faces) {
    bytes += face.bytes
    if (bytes > limits.bytes) return limitRefusal('localFonts.bytes', bytes, limits.bytes, { where: JSON.stringify(face.family) })
  }
}
