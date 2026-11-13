import type { TextDirection } from '@segnavia/format'
import { firstStrongDirection } from '@segnavia/format'

export function diagramErrorFirstLine(error: unknown): string {
  const message = error && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : String(error)
  return message.split(/\r?\n/, 1)[0] || 'Diagram could not be drawn.'
}

export function diagramFailureIssue(subject: string, error: unknown): { subject: string; message: string } {
  return { subject: subject || 'diagram', message: diagramErrorFirstLine(error) }
}

export function diagramLabelDirection(text: string): TextDirection {
  return firstStrongDirection(text) ?? 'ltr'
}
