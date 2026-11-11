import {
  boundPreflightReport,
  type PreflightEntry,
  type PreflightProfile,
  type PreflightProfileInput,
  type PreflightReport,
  resolvePreflightProfile,
} from '@segnavia/format'

export function surfacePreflightProfile(input: PreflightProfileInput): PreflightProfile {
  const resolved = resolvePreflightProfile(input)
  return Object.freeze(
    Object.fromEntries(
      Object.entries(resolved).map(([check, severity]) => [check, check === 'slot-overset' || check === 'font-missing' ? severity : 'off']),
    ) as unknown as PreflightProfile,
  )
}

export function mergeSurfacePreflightReports(reports: ReadonlyMap<number, PreflightReport>, total: number, profile: PreflightProfile): PreflightReport {
  const entries: PreflightEntry[] = []
  const omitted: Record<string, number> = {}
  const pages: PreflightReport['facts']['pages'][number][] = []
  const fits: PreflightReport['facts']['fits'][number][] = []
  const measured = [...reports.entries()]
    .filter(([index]) => Number.isSafeInteger(index) && index >= 0 && index < total)
    .sort(([left], [right]) => left - right)
  for (const [index, report] of measured) {
    for (const issue of report.issues) entries.push({ ...issue, location: { ...issue.location, folio: String(index + 1) } })
    for (const [check, count] of Object.entries(report.omitted)) omitted[check] = (omitted[check] ?? 0) + (count ?? 0)
    pages.push(...report.facts.pages)
    fits.push(...report.facts.fits)
  }
  return boundPreflightReport({ entries, omitted, facts: { pageCount: total, pages, fits }, coverage: { measured: measured.length, total } }, profile)
}

export class SurfacePreflightCoordinator {
  private input: PreflightProfileInput = 'default'
  private reports = new Map<number, PreflightReport>()
  private scope: unknown
  private total = 0

  constructor(private target: EventTarget) {}

  get profile(): PreflightProfileInput {
    return this.input
  }

  set profile(value: PreflightProfileInput) {
    this.input = value
    this.clear()
  }

  resolvedProfile(): PreflightProfile {
    return surfacePreflightProfile(this.input)
  }

  reset(scope: unknown, total: number): void {
    if (scope === this.scope && total === this.total) return
    this.scope = scope
    this.total = total
    this.reports.clear()
  }

  clear(): void {
    this.scope = undefined
    this.total = 0
    this.reports.clear()
  }

  receive(index: number, report: PreflightReport, total = this.total): void {
    this.total = total
    this.reports.set(index, report)
    const merged = mergeSurfacePreflightReports(this.reports, total, this.resolvedProfile())
    this.target.dispatchEvent(new CustomEvent('preflight', { detail: merged, bubbles: true, composed: true }))
  }
}
