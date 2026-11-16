import type { PreflightCoverage, PreflightCoverageUnit, PreflightEntry, PreflightReport } from './preflight.ts'

export function hjViolationMessage(wordSpacing: number, minimum: number, maximum: number, ratio: number): string {
  const percent = (value: number): string => `${Math.round(value * 10) / 10}%`
  const remedy = 'Widen the measure, allow hyphenation, widen the word-spacing limits, or edit the text to clear this violation.'
  if (ratio === Number.NEGATIVE_INFINITY) {
    return `The worst line is overfull even at the ${percent(minimum)} minimum word spacing; no word spacing can set it. ${remedy}`
  }
  if (ratio === Number.POSITIVE_INFINITY) {
    return `The worst line is too short and has no space to stretch within the ${percent(minimum)}–${percent(maximum)} word-spacing limits; no word spacing can set it. ${remedy}`
  }
  return `The worst line uses ${percent(wordSpacing)} word spacing, outside the ${percent(minimum)}–${percent(maximum)} limits (adjustment ratio ${ratio.toFixed(2)}). ${remedy}`
}

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
