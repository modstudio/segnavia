import type { FontReference } from '@segnavia/format'
import { type FontsOptions, uniqueFontReferences } from '@segnavia/frame/fonts'
import type { AlertLabels } from '@segnavia/html'

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength)
    const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength)
    return a.length === b.length && a.every((value, index) => value === b[index])
  }
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftEntries = Object.entries(left)
  const rightRecord = right as Record<string, unknown>
  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(([key, value]) => Object.hasOwn(rightRecord, key) && equalValue(value, rightRecord[key]))
  )
}

export function normalizeLockedFences(value: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(value ?? {}).map(([name, label]) => [name.toLowerCase(), String(label)]))
}

export function equalLockedFences(left: Record<string, string>, right: Record<string, string>): boolean {
  return equalValue(left, right)
}

export function equalAlertLabels(left: Partial<AlertLabels> | undefined, right: Partial<AlertLabels> | undefined): boolean {
  return equalValue(left, right)
}

export function normalizeAlertLabels(value: Partial<AlertLabels> | undefined): Partial<AlertLabels> | undefined {
  return value && Object.fromEntries(Object.entries(value).map(([kind, label]) => [kind, String(label)]))
}

export function normalizeFontReferences(value: FontReference[] | undefined): FontReference[] {
  return uniqueFontReferences([...(value ?? [])])
}

export function equalFontReferences(left: FontReference[], right: FontReference[]): boolean {
  return equalValue(left, right)
}

export function equalFonts(left: FontsOptions | undefined, right: FontsOptions | undefined): boolean {
  return equalValue(left, right)
}
