import { FIT_STRATEGIES } from './fit.ts'
import type { FontFailure } from './fonts.ts'

export const PREFLIGHT_CHECKS = [
  'fit-limit',
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

export function appendSlotOversetEntries(slots: Record<string, string>, entries: PreflightEntry[], location?: PreflightLocation): void {
  for (const [key, state] of Object.entries(slots)) {
    if (state !== 'overflowed' || entries.some((entry) => entry.check === 'slot-overset' && entry.subject === key)) continue
    entries.push({
      check: 'slot-overset',
      subject: key,
      message: `Slot ${key} is overset; shorten its value or enlarge the slot to clear it.`,
      ...(location === undefined ? {} : { location }),
    })
  }
}

export function fontMissingEntries(failures: readonly FontFailure[], location?: PreflightLocation): PreflightEntry[] {
  return failures.map((failure) => {
    const weight = Array.isArray(failure.weight) ? failure.weight.join('–') : failure.weight
    const details = [weight === undefined ? undefined : `weight ${weight}`, failure.style].filter(Boolean)
    const subject = details.length === 0 ? failure.family : `${failure.family} (${details.join(', ')})`
    return {
      check: 'font-missing',
      subject,
      message: `Font face ${subject} is missing; supply and load that face to clear it.`,
      ...(location === undefined ? {} : { location }),
    }
  })
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
  readonly subject: string
  readonly group?: string
  readonly values: Readonly<Record<string, string>>
}
export interface PreflightFacts {
  readonly pageCount: number
  readonly pages: readonly PreflightPageFacts[]
  readonly fits: readonly PreflightFit[]
}
export interface PreflightCoverage {
  readonly measured: number
  readonly total: number
}
export interface PreflightReport {
  readonly status: 'clean' | 'incomplete' | 'warnings' | 'errors'
  readonly issues: readonly PreflightIssue[]
  readonly omitted: Readonly<Partial<Record<PreflightCheck, number>>>
  readonly facts: PreflightFacts
  readonly coverage: PreflightCoverage
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
export const PREFLIGHT_FIT_VALUES_LIMIT = FIT_STRATEGIES.length

export function boundPreflightReport(
  input: { readonly entries: unknown; readonly facts: unknown; readonly omitted?: unknown; readonly coverage?: unknown },
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
    readonly fitValues: number
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
      fitValues: PREFLIGHT_FIT_VALUES_LIMIT,
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
      const fit = held as { subject?: unknown; group?: unknown; values?: unknown }
      const subject = boundedPreflightText(fit.subject, limits.fitGroup)
      const group = boundedPreflightText(fit.group, limits.fitGroup)
      if (subject === undefined || !fit.values || typeof fit.values !== 'object' || Array.isArray(fit.values)) return []
      const values = Object.fromEntries(
        Object.entries(fit.values)
          .slice(0, limits.fitValues)
          .flatMap(([strategy, value]) => {
            const bounded = boundedPreflightText(value, limits.fitSize)
            return bounded === undefined ? [] : [[strategy.slice(0, limits.fitGroup), bounded]]
          }),
      )
      return [{ subject, ...(group === undefined ? {} : { group }), values }]
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
  const facts = boundedPreflightFacts(input.facts)
  const coverage = (() => {
    if (!input.coverage || typeof input.coverage !== 'object' || Array.isArray(input.coverage)) {
      return { measured: facts.pageCount, total: facts.pageCount }
    }
    const source = input.coverage as { measured?: unknown; total?: unknown }
    if (!Number.isSafeInteger(source.measured) || (source.measured as number) < 0 || !Number.isSafeInteger(source.total) || (source.total as number) < 0) {
      return { measured: facts.pageCount, total: facts.pageCount }
    }
    const total = Math.min(source.total as number, limits.pages)
    return { measured: Math.min(source.measured as number, total), total }
  })()
  const status = cleanIssues.some((issue) => issue.severity === 'error')
    ? 'errors'
    : cleanIssues.length
      ? 'warnings'
      : coverage.measured < coverage.total
        ? 'incomplete'
        : 'clean'
  return { status, issues: cleanIssues, omitted, facts, coverage }
}

export function preflightRefusal(report: PreflightReport): string | undefined {
  return report.issues.find((issue) => issue.severity === 'error')?.message
}
