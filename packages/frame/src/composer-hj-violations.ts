import { hjViolationMessage, type PreflightEntry } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export interface HjSpacing {
  minimum: number
  desired: number
  maximum: number
}

export interface HjLine {
  ratio?: number
}

export interface HjViolation {
  line: number
  ratio: number
  wordSpacingPercent: number
}

export interface ComposedHjViolation {
  spacing: HjSpacing
  violation: HjViolation
}

export function hjLineRatio(ratio: number, forced: boolean, final: boolean): number {
  return forced || final ? Math.min(ratio, 0) : ratio
}

export function wordSpacingForRatio(ratio: number, spacing: HjSpacing): number {
  return ratio < 0 ? spacing.desired + ratio * (spacing.desired - spacing.minimum) : spacing.desired + ratio * (spacing.maximum - spacing.desired)
}

export function worstViolation(lines: readonly HjLine[], spacing: HjSpacing): HjViolation | undefined {
  let worst: HjViolation | undefined
  let worstDistance = 0
  for (let line = 0; line < lines.length; line++) {
    const ratio = lines[line]?.ratio ?? 0
    const distance = ratio < -1 ? -1 - ratio : ratio > 1 ? ratio - 1 : 0
    if (distance <= worstDistance) continue
    worstDistance = distance
    worst = { line, ratio, wordSpacingPercent: wordSpacingForRatio(ratio, spacing) }
  }
  return worst
}

export function hjViolationEntry(subject: string, folio: string | undefined, violation: HjViolation, spacing: HjSpacing): PreflightEntry {
  return {
    check: 'hj-violations',
    subject,
    message: hjViolationMessage(violation.wordSpacingPercent, spacing.minimum, spacing.maximum, violation.ratio),
    ...(folio === undefined ? {} : { location: { folio } }),
  }
}

export function embeddedComposerHjViolationFunctions(): string {
  return `${embedFunction('hjViolationMessage', hjViolationMessage)}
${embedFunction('hjLineRatio', hjLineRatio)}
${embedFunction('wordSpacingForRatio', wordSpacingForRatio)}
${embedFunction('worstViolation', worstViolation)}
${embedFunction('hjViolationEntry', hjViolationEntry)}`
}
