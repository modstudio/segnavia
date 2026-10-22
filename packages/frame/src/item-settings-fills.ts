import type { Fill, SlotValue } from '@segnavia/format'

export const PROVISIONAL_FILL_PREFIX = 'provisional:'

export function fillLabel(fill: Fill): string {
  return fill.label || fill.id
}

export function isProvisionalFillId(id: string): boolean {
  return id.startsWith(PROVISIONAL_FILL_PREFIX)
}

export function provisionalFillId(): string {
  const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${PROVISIONAL_FILL_PREFIX}${unique}`
}

export function cloneSlotValue(value: SlotValue): SlotValue {
  return typeof value === 'object' ? { asset: value.asset } : value
}

export function cloneFill(fill: Fill): Fill {
  const values: Fill['values'] = {}
  for (const [key, value] of Object.entries(fill.values)) values[key] = cloneSlotValue(value)
  return fill.label === undefined ? { id: fill.id, values } : { id: fill.id, label: fill.label, values }
}

export function cloneFills(fills: readonly Fill[]): Fill[] {
  return fills.map(cloneFill)
}

export function sameSlotValue(left: SlotValue | undefined, right: SlotValue | undefined): boolean {
  if (left === right) return true
  if (typeof left === 'object' && typeof right === 'object') return left.asset === right.asset
  return false
}

export function sameFill(left: Fill, right: Fill): boolean {
  if (left.id !== right.id || left.label !== right.label) return false
  const keys = new Set([...Object.keys(left.values), ...Object.keys(right.values)])
  for (const key of keys) if (!sameSlotValue(left.values[key], right.values[key])) return false
  return true
}

export function selectedFill(fills: readonly Fill[], id: string | null): Fill | undefined {
  return id === null ? undefined : fills.find((fill) => fill.id === id)
}

export function addFill(fills: readonly Fill[], fill: Fill): Fill[] {
  return [...cloneFills(fills), cloneFill(fill)]
}

export function replaceFill(fills: readonly Fill[], id: string, fill: Fill): Fill[] {
  return fills.map((item) => (item.id === id ? cloneFill(fill) : cloneFill(item)))
}

export function removeFill(fills: readonly Fill[], id: string): Fill[] {
  return fills.filter((fill) => fill.id !== id).map(cloneFill)
}

export function renameFill(fills: readonly Fill[], id: string, label: string): Fill[] {
  return fills.map((fill) => {
    const next = cloneFill(fill)
    if (fill.id === id) next.label = label
    return next
  })
}

export function setFillValue(fills: readonly Fill[], id: string, key: string, value: SlotValue | undefined): Fill[] {
  return fills.map((fill) => {
    const next = cloneFill(fill)
    if (fill.id !== id) return next
    if (value === undefined || value === '') delete next.values[key]
    else next.values[key] = cloneSlotValue(value)
    return next
  })
}

export function nextSelectedFillId(fills: readonly Fill[], removed: string, current: string | null): string | null {
  if (current !== removed) return current
  return fills[0]?.id ?? null
}
