import { type AsOf, type AsOfDay, CalendarDate, type Zone } from './as-of.ts'
import { zonedParts } from './zoned-parts.ts'

export interface AsOfFacts {
  moment: number
  hostMoment?: number
  hostZone?: Zone
}

export type AsOfResolution = { kind: 'day'; day: AsOfDay } | { kind: 'anchor'; anchor: string; today: CalendarDate; zone: Zone }

export function calendarDate(moment: number, zone: Zone): CalendarDate {
  const parts = zonedParts(moment, zone)
  return CalendarDate.parse(`${parts.year}-${parts.month}-${parts.day}`)
}

function asOfZone(asOf: AsOf | undefined, hostZone?: Zone): Zone {
  return asOf?.zone ?? hostZone ?? 'UTC'
}

export function resolveAsOfDay(asOf: AsOf | undefined, facts: AsOfFacts): AsOfResolution {
  const zone = asOfZone(asOf, facts.hostZone)
  if (asOf?.kind === 'fixed') return { kind: 'day', day: { date: asOf.date, zone, kind: 'fixed' } }
  const today = calendarDate(facts.moment, zone)
  if (asOf?.kind === 'anchor') {
    return { kind: 'anchor', anchor: asOf.anchor, today, zone }
  }
  return { kind: 'day', day: { date: today, zone, kind: 'current' } }
}

export function asOfRefusal(anchor: string, reason: string): string {
  return `As-of anchor ${JSON.stringify(anchor)} could not resolve to a calendar date: ${reason}; resolve the anchor to a calendar date to clear this refusal.`
}

export class AsOfRefusedError extends Error {
  override name = 'AsOfRefusedError'
}
