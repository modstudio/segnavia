export const PREFLIGHT_CHECKS = [
  'region-overset',
  'furniture-overset',
  'slot-overset',
  'font-missing',
  'placement-missing',
  'css-var-invalid',
  'css-url-network',
] as const

export type PreflightCheck = (typeof PREFLIGHT_CHECKS)[number]
export type PreflightSeverity = 'off' | 'warning' | 'error'
export type PreflightProfile = Readonly<Record<PreflightCheck, PreflightSeverity>>
export type PreflightPreset = 'default' | 'strict' | 'off'
export type PreflightProfileInput = PreflightPreset | Partial<Record<PreflightCheck, PreflightSeverity>>

const profile = (severity: PreflightSeverity): PreflightProfile =>
  Object.freeze(Object.fromEntries(PREFLIGHT_CHECKS.map((check) => [check, severity])) as Record<PreflightCheck, PreflightSeverity>)

export const PREFLIGHT_PRESETS: Readonly<Record<PreflightPreset, PreflightProfile>> = Object.freeze({
  default: profile('warning'),
  strict: profile('error'),
  off: profile('off'),
})

const severities = new Set<unknown>(['off', 'warning', 'error'])

export function resolvePreflightProfile(input: PreflightProfileInput = 'default'): PreflightProfile {
  if (typeof input === 'string') {
    const preset = (PREFLIGHT_PRESETS as Record<string, PreflightProfile | undefined>)[input]
    if (!preset) throw new Error(`Preflight preset ${JSON.stringify(input)} is unknown; use "default", "strict", or "off" to clear this refusal.`)
    return preset
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The preflight profile is invalid; use a preset name or a check-to-severity map to clear this refusal.')
  }
  const unknown = Object.keys(input).find((check) => !(PREFLIGHT_CHECKS as readonly string[]).includes(check))
  if (unknown) throw new Error(`Preflight check ${JSON.stringify(unknown)} is unknown; remove it from the profile to clear this refusal.`)
  const resolved = { ...PREFLIGHT_PRESETS.default }
  for (const check of PREFLIGHT_CHECKS) {
    const severity = input[check]
    if (severity === undefined) continue
    if (!severities.has(severity)) {
      throw new Error(`Preflight severity ${JSON.stringify(severity)} for ${check} is invalid; use "off", "warning", or "error" to clear this refusal.`)
    }
    resolved[check] = severity
  }
  return Object.freeze(resolved)
}

export interface PreflightLocation {
  readonly folio?: string
  readonly block?: string
}

export interface PreflightEntry {
  readonly check: PreflightCheck
  readonly subject: string
  readonly message: string
  readonly location?: PreflightLocation
}

export type PreflightIssue = PreflightEntry & { readonly id: string; readonly severity: 'warning' | 'error' }
export interface PreflightPageFacts {
  readonly folio: string
  readonly first?: string
  readonly last?: string
}
export interface PreflightFit {
  readonly group: string
  readonly size: string
}
export interface PreflightFacts {
  readonly pageCount: number
  readonly pages: readonly PreflightPageFacts[]
  readonly fits: readonly PreflightFit[]
}
export interface PreflightReport {
  readonly status: 'clean' | 'warnings' | 'errors'
  readonly issues: readonly PreflightIssue[]
  readonly omitted: Readonly<Partial<Record<PreflightCheck, number>>>
  readonly facts: PreflightFacts
}

export const PREFLIGHT_ISSUES_PER_CHECK = 64
export const PREFLIGHT_SUBJECT_LIMIT = 256
export const PREFLIGHT_MESSAGE_LIMIT = 1024
export const PREFLIGHT_FOLIO_LIMIT = 32
export const PREFLIGHT_BLOCK_LIMIT = 256
export const PREFLIGHT_PAGES_LIMIT = 10_000
export const PREFLIGHT_FITS_LIMIT = 256
export const PREFLIGHT_FIT_GROUP_LIMIT = 256
export const PREFLIGHT_FIT_SIZE_LIMIT = 64

const boundedPreflightText = (value: unknown, limit: number): string | undefined => (typeof value === 'string' ? value.slice(0, limit) : undefined)

function boundedPreflightLocation(value: unknown): PreflightLocation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as { folio?: unknown; block?: unknown }
  const folio = boundedPreflightText(source.folio, PREFLIGHT_FOLIO_LIMIT)
  const block = boundedPreflightText(source.block, PREFLIGHT_BLOCK_LIMIT)
  return folio === undefined && block === undefined ? undefined : { ...(folio === undefined ? {} : { folio }), ...(block === undefined ? {} : { block }) }
}

function boundedPreflightEntry(value: unknown, profile: PreflightProfile, order: number): (PreflightIssue & { order: number }) | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as { check?: unknown; subject?: unknown; message?: unknown; location?: unknown }
  if (typeof source.check !== 'string' || !(PREFLIGHT_CHECKS as readonly string[]).includes(source.check)) return undefined
  const check = source.check as PreflightCheck
  const severity = profile[check]
  if (severity === 'off') return undefined
  const subject = boundedPreflightText(source.subject, PREFLIGHT_SUBJECT_LIMIT)
  const message = boundedPreflightText(source.message, PREFLIGHT_MESSAGE_LIMIT)
  if (subject === undefined || message === undefined) return undefined
  const location = boundedPreflightLocation(source.location)
  return { check, subject, message, id: `${check}:${subject}`, severity, ...(location ? { location } : {}), order }
}

function boundedPreflightFacts(value: unknown): PreflightFacts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { pageCount: 0, pages: [], fits: [] }
  const source = value as { pageCount?: unknown; pages?: unknown; fits?: unknown }
  if (!Number.isSafeInteger(source.pageCount) || (source.pageCount as number) < 0 || !Array.isArray(source.pages) || !Array.isArray(source.fits)) {
    return { pageCount: 0, pages: [], fits: [] }
  }
  const pages = source.pages.slice(0, PREFLIGHT_PAGES_LIMIT).flatMap((value): PreflightPageFacts[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const page = value as { folio?: unknown; first?: unknown; last?: unknown }
    const folio = boundedPreflightText(page.folio, PREFLIGHT_FOLIO_LIMIT)
    if (folio === undefined) return []
    const first = boundedPreflightText(page.first, PREFLIGHT_BLOCK_LIMIT)
    const last = boundedPreflightText(page.last, PREFLIGHT_BLOCK_LIMIT)
    return [{ folio, ...(first === undefined ? {} : { first }), ...(last === undefined ? {} : { last }) }]
  })
  const fits = source.fits.slice(0, PREFLIGHT_FITS_LIMIT).flatMap((value): PreflightFit[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const fit = value as { group?: unknown; size?: unknown }
    const group = boundedPreflightText(fit.group, PREFLIGHT_FIT_GROUP_LIMIT)
    const size = boundedPreflightText(fit.size, PREFLIGHT_FIT_SIZE_LIMIT)
    return group === undefined || size === undefined ? [] : [{ group, size }]
  })
  return { pageCount: source.pageCount as number, pages, fits }
}

export function boundPreflightReport(input: { readonly entries: unknown; readonly facts: unknown }, profile: PreflightProfile): PreflightReport {
  const entries = Array.isArray(input.entries) ? input.entries : []
  const counts: Partial<Record<PreflightCheck, number>> = {}
  const omitted: Partial<Record<PreflightCheck, number>> = {}
  const issues: (PreflightIssue & { order: number })[] = []
  for (let order = 0; order < entries.length; order += 1) {
    const issue = boundedPreflightEntry(entries[order], profile, order)
    if (!issue) continue
    const check = issue.check
    counts[check] = (counts[check] ?? 0) + 1
    if ((counts[check] ?? 0) > 64) {
      omitted[check] = (omitted[check] ?? 0) + 1
      continue
    }
    issues.push(issue)
  }
  issues.sort((a, b) => {
    const severity = Number(b.severity === 'error') - Number(a.severity === 'error')
    if (severity) return severity
    const check = PREFLIGHT_CHECKS.indexOf(a.check) - PREFLIGHT_CHECKS.indexOf(b.check)
    return check || a.order - b.order
  })
  const cleanIssues = issues.map(({ order: _, ...issue }) => issue)
  const status = cleanIssues.some((issue) => issue.severity === 'error') ? 'errors' : cleanIssues.length ? 'warnings' : 'clean'
  return { status, issues: cleanIssues, omitted, facts: boundedPreflightFacts(input.facts) }
}

export function preflightRefusal(report: PreflightReport): string | undefined {
  return report.issues.find((issue) => issue.severity === 'error')?.message
}
