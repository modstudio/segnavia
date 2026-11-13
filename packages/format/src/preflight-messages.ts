import type { PreflightCoverage, PreflightCoverageUnit, PreflightEntry, PreflightReport } from './preflight.ts'

export function cssVarInvalidMessage(subject: string): string {
  const remedies = [
    {
      prefix: '--segnavia-font-',
      remedy: (name: string) => `declare font ${name} in style.fonts and supply it from the font source`,
    },
  ] as const
  const rule = remedies.find(({ prefix }) => subject.startsWith(prefix))
  const remedy = rule ? rule.remedy(subject.slice(rule.prefix.length)) : 'define it or add a var() fallback'
  return `Custom property ${subject} is invalid; ${remedy} to clear it.`
}

export function coverageIncompleteMessage(measured: number, total: number, unit: PreflightCoverageUnit): string {
  const subject = total === 1 ? unit : `${unit}s`
  return `Preflight measured ${measured} of ${total} ${subject}; a ${unit} that is never laid out cannot be checked. Lay out every ${unit} to clear this.`
}

export function slotCoverageIncompleteMessage(measured: number, total: number): string {
  const subject = total === 1 ? 'marked slot' : 'marked slots'
  return `Preflight measured ${measured} of ${total} ${subject}; a slot that is never laid out cannot be checked. Lay out every marked slot to clear this.`
}

export function coverageIncompleteEntries(coverage: PreflightCoverage, unit: PreflightCoverageUnit): PreflightEntry[] {
  const entries: PreflightEntry[] = []
  if (coverage.measured < coverage.total) {
    entries.push({ check: 'coverage-incomplete', subject: `${unit}s`, message: coverageIncompleteMessage(coverage.measured, coverage.total, unit) })
  }
  if (coverage.slots.measured < coverage.slots.total) {
    entries.push({
      check: 'coverage-incomplete',
      subject: 'slots',
      message: slotCoverageIncompleteMessage(coverage.slots.measured, coverage.slots.total),
    })
  }
  return entries
}

export function preflightRefusal(report: PreflightReport): string | undefined {
  return report.issues.find((issue) => issue.severity === 'error')?.message
}
