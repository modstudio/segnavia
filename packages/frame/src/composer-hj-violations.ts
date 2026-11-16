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
  wordSpacing: number
}

export interface ComposedHjViolation {
  spacing: HjSpacing
  violation: HjViolation
}

function wordSpacingForRatio(ratio: number, spacing: HjSpacing): number {
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
    worst = { line, ratio, wordSpacing: wordSpacingForRatio(ratio, spacing) }
  }
  return worst
}

export function hjViolationEntry(subject: string, folio: string, violation: HjViolation, spacing: HjSpacing): PreflightEntry {
  return {
    check: 'hj-violations',
    subject,
    message: hjViolationMessage(violation.wordSpacing, spacing.minimum, spacing.maximum, violation.ratio),
    location: { folio },
  }
}

export function embeddedComposerHjViolationFunctions(): string {
  return `${embedFunction('hjViolationMessage', hjViolationMessage)}
${embedFunction('wordSpacingForRatio', wordSpacingForRatio)}
${embedFunction('worstViolation', worstViolation)}
${embedFunction('hjViolationEntry', hjViolationEntry)}`
}
