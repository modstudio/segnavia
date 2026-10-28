import type { Element } from 'domhandler'
import { refusal } from './refusal.ts'

export function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

export function numberAttribute(element: Element | undefined, name: string, fallback?: number): number {
  const raw = element?.attribs[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw refusal(`IDML ${name} must be a non-negative number`, `set ${name} to a non-negative numeric value`)
  }
  return value
}

export function idmlDirection(value: string | undefined): 'ltr' | 'rtl' | undefined {
  const normalized = value?.toLowerCase()
  if (normalized?.includes('righttoleft')) return 'rtl'
  if (normalized?.includes('lefttoright')) return 'ltr'
  return undefined
}
