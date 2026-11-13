import type { PreflightReport } from './preflight.ts'

export function cssVarInvalidMessage(subject: string): string {
  return `Custom property ${subject} is invalid; define it or add a var() fallback to clear it.`
}

export function preflightRefusal(report: PreflightReport): string | undefined {
  return report.issues.find((issue) => issue.severity === 'error')?.message
}
