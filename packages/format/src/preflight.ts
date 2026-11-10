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

export function preflightEnabled(profile: PreflightProfile): boolean {
  return PREFLIGHT_CHECKS.some((check) => profile[check] !== 'off')
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

export function cssVarInvalidMessage(subject: string): string {
  return `Custom property ${subject} is invalid; define it or add a var() fallback to clear it.`
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

export function boundPreflightReport(
  input: { readonly entries: unknown; readonly facts: unknown; readonly omitted?: unknown },
  profile: PreflightProfile,
  bounds?: {
    readonly checks: readonly PreflightCheck[]
    readonly issuesPerCheck: number
    readonly subject: number
    readonly message: number
    readonly folio: number
    readonly block: number
    readonly pages: number
    readonly fits: number
    readonly fitGroup: number
    readonly fitSize: number
  },
): PreflightReport {
  const limits =
    bounds ??
    ({
      checks: PREFLIGHT_CHECKS,
      issuesPerCheck: PREFLIGHT_ISSUES_PER_CHECK,
      subject: PREFLIGHT_SUBJECT_LIMIT,
      message: PREFLIGHT_MESSAGE_LIMIT,
      folio: PREFLIGHT_FOLIO_LIMIT,
      block: PREFLIGHT_BLOCK_LIMIT,
      pages: PREFLIGHT_PAGES_LIMIT,
      fits: PREFLIGHT_FITS_LIMIT,
      fitGroup: PREFLIGHT_FIT_GROUP_LIMIT,
      fitSize: PREFLIGHT_FIT_SIZE_LIMIT,
    } as const)
  const boundedPreflightText = (value: unknown, limit: number): string | undefined => (typeof value === 'string' ? value.slice(0, limit) : undefined)
  const boundedPreflightLocation = (value: unknown): PreflightLocation | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const source = value as { folio?: unknown; block?: unknown }
    const folio = boundedPreflightText(source.folio, limits.folio)
    const block = boundedPreflightText(source.block, limits.block)
    return folio === undefined && block === undefined ? undefined : { ...(folio === undefined ? {} : { folio }), ...(block === undefined ? {} : { block }) }
  }
  const boundedPreflightEntry = (value: unknown, order: number): (PreflightIssue & { order: number }) | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const source = value as { check?: unknown; subject?: unknown; message?: unknown; location?: unknown }
    if (typeof source.check !== 'string' || !(limits.checks as readonly string[]).includes(source.check)) return undefined
    const check = source.check as PreflightCheck
    const severity = profile[check]
    if (severity === 'off') return undefined
    const subject = boundedPreflightText(source.subject, limits.subject)
    const message = boundedPreflightText(source.message, limits.message)
    if (subject === undefined || message === undefined) return undefined
    const location = boundedPreflightLocation(source.location)
    return { check, subject, message, id: `${check}:${subject}`, severity, ...(location ? { location } : {}), order }
  }
  const boundedPreflightFacts = (value: unknown): PreflightFacts => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { pageCount: 0, pages: [], fits: [] }
    const source = value as { pageCount?: unknown; pages?: unknown; fits?: unknown }
    if (!Number.isSafeInteger(source.pageCount) || (source.pageCount as number) < 0 || !Array.isArray(source.pages) || !Array.isArray(source.fits)) {
      return { pageCount: 0, pages: [], fits: [] }
    }
    const pages = source.pages.slice(0, limits.pages).flatMap((held): PreflightPageFacts[] => {
      if (!held || typeof held !== 'object' || Array.isArray(held)) return []
      const page = held as { folio?: unknown; first?: unknown; last?: unknown }
      const folio = boundedPreflightText(page.folio, limits.folio)
      if (folio === undefined) return []
      const first = boundedPreflightText(page.first, limits.block)
      const last = boundedPreflightText(page.last, limits.block)
      return [{ folio, ...(first === undefined ? {} : { first }), ...(last === undefined ? {} : { last }) }]
    })
    const fits = source.fits.slice(0, limits.fits).flatMap((held): PreflightFit[] => {
      if (!held || typeof held !== 'object' || Array.isArray(held)) return []
      const fit = held as { group?: unknown; size?: unknown }
      const group = boundedPreflightText(fit.group, limits.fitGroup)
      const size = boundedPreflightText(fit.size, limits.fitSize)
      return group === undefined || size === undefined ? [] : [{ group, size }]
    })
    return { pageCount: Math.min(source.pageCount as number, limits.pages), pages, fits }
  }
  const entries = Array.isArray(input.entries) ? input.entries : []
  const counts: Partial<Record<PreflightCheck, number>> = {}
  const omitted: Partial<Record<PreflightCheck, number>> = {}
  const omittedLimit = 10_000
  if (input.omitted && typeof input.omitted === 'object' && !Array.isArray(input.omitted)) {
    for (const check of limits.checks) {
      const value = (input.omitted as Record<string, unknown>)[check]
      if (Number.isSafeInteger(value) && (value as number) >= 0) omitted[check] = Math.min(value as number, omittedLimit)
    }
  }
  const addOmitted = (check: PreflightCheck): void => {
    omitted[check] = Math.min((omitted[check] ?? 0) + 1, omittedLimit)
  }
  const issues: (PreflightIssue & { order: number })[] = []
  const ids = new Set<string>()
  const scanLimit = limits.issuesPerCheck * limits.checks.length * 4
  const addIssue = (value: unknown, order: number): void => {
    const issue = boundedPreflightEntry(value, order)
    if (!issue || ids.has(issue.id)) return
    ids.add(issue.id)
    const check = issue.check
    counts[check] = (counts[check] ?? 0) + 1
    if ((counts[check] ?? 0) > limits.issuesPerCheck) {
      addOmitted(check)
      return
    }
    issues.push(issue)
  }
  for (let order = 0; order < Math.min(entries.length, scanLimit); order += 1) addIssue(entries[order], order)
  issues.sort((a, b) => {
    const severity = Number(b.severity === 'error') - Number(a.severity === 'error')
    if (severity) return severity
    const check = limits.checks.indexOf(a.check) - limits.checks.indexOf(b.check)
    return check || a.order - b.order
  })
  const cleanIssues = issues.map(({ order: _, ...issue }) => issue)
  const status = cleanIssues.some((issue) => issue.severity === 'error') ? 'errors' : cleanIssues.length ? 'warnings' : 'clean'
  return { status, issues: cleanIssues, omitted, facts: boundedPreflightFacts(input.facts) }
}

export function preflightRefusal(report: PreflightReport): string | undefined {
  return report.issues.find((issue) => issue.severity === 'error')?.message
}
