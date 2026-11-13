import {
  boundPreflightReport,
  type PreflightEntry,
  type PreflightProfile,
  type PreflightProfileInput,
  type PreflightReport,
  preflightEnabled,
  resolvePreflightProfile,
} from '@segnavia/format'

export type SurfacePreflightKey = number | string

export interface SurfacePreflightItem<Key extends SurfacePreflightKey = SurfacePreflightKey> {
  key: Key
  folio: string
  kind: 'page' | 'slide'
}

export function surfacePreflightProfile(input: PreflightProfileInput): PreflightProfile {
  const resolved = resolvePreflightProfile(input)
  return Object.freeze(
    Object.fromEntries(
      Object.entries(resolved).map(([check, severity]) => [
        check,
        check === 'slot-overset' || check === 'font-missing' || check === 'coverage-incomplete' ? severity : 'off',
      ]),
    ) as unknown as PreflightProfile,
  )
}

export function mergeSurfacePreflightReports<Key extends SurfacePreflightKey>(
  reports: ReadonlyMap<Key, PreflightReport>,
  surface: readonly SurfacePreflightItem<Key>[],
  profile: PreflightProfile,
): PreflightReport {
  const entries: PreflightEntry[] = []
  const omitted: Record<string, number> = {}
  const pages: PreflightReport['facts']['pages'][number][] = []
  const fits: PreflightReport['facts']['fits'][number][] = []
  let measured = 0
  let measuredSlots = 0
  let totalSlots = 0
  for (const { key, folio } of surface) {
    const report = reports.get(key)
    if (!report) continue
    measured++
    measuredSlots += report.coverage.slots.measured
    totalSlots += report.coverage.slots.total
    for (const issue of report.issues) entries.push({ ...issue, location: { ...issue.location, folio } })
    for (const [check, count] of Object.entries(report.omitted)) omitted[check] = (omitted[check] ?? 0) + (count ?? 0)
    pages.push(...report.facts.pages)
    fits.push(...report.facts.fits)
  }
  const total = surface.length
  const unit = surface[0]?.kind ?? 'page'
  return boundPreflightReport(
    { entries, omitted, facts: { pageCount: total, pages, fits }, coverage: { measured, total, slots: { measured: measuredSlots, total: totalSlots } } },
    profile,
    { unit },
  )
}

export class SurfacePreflightCoordinator<Key extends SurfacePreflightKey = SurfacePreflightKey> {
  private input: PreflightProfileInput = 'default'
  private resolved = surfacePreflightProfile(this.input)
  private reports = new Map<Key, PreflightReport>()
  private surface: readonly SurfacePreflightItem<Key>[] = []

  constructor(private target: EventTarget) {}

  get profile(): PreflightProfileInput {
    return this.input
  }

  set profile(value: PreflightProfileInput) {
    const resolved = surfacePreflightProfile(value)
    this.input = value
    this.resolved = resolved
    this.reports.clear()
  }

  get enabled(): boolean {
    return preflightEnabled(this.resolved)
  }

  resolvedProfile(): PreflightProfile {
    return this.resolved
  }

  setSurface(surface: readonly SurfacePreflightItem<Key>[], retainReports: boolean): void {
    this.surface = surface
    if (!retainReports) {
      this.reports.clear()
      return
    }
    const kept = new Set(surface.map(({ key }) => key))
    for (const key of this.reports.keys()) if (!kept.has(key)) this.reports.delete(key)
  }

  receive(key: Key, report: PreflightReport): void {
    if (!this.enabled || !this.surface.some((item) => item.key === key)) return
    this.reports.set(key, report)
    const merged = mergeSurfacePreflightReports(this.reports, this.surface, this.resolved)
    this.target.dispatchEvent(new CustomEvent('preflight', { detail: merged, bubbles: true, composed: true }))
  }
}

const surfacePreflightCoordinators = new WeakMap<EventTarget, SurfacePreflightCoordinator>()

export function surfacePreflightFor(target: EventTarget): SurfacePreflightCoordinator {
  let coordinator = surfacePreflightCoordinators.get(target)
  if (!coordinator) {
    coordinator = new SurfacePreflightCoordinator(target)
    surfacePreflightCoordinators.set(target, coordinator)
  }
  return coordinator
}
