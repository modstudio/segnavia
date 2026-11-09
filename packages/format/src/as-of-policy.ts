import { type AsOf, type AsOfDay, CalendarDate, type Zone } from './as-of.ts'

export interface AsOfFacts {
  moment: number
  zone: Zone
}

export type AsOfResolution = { kind: 'day'; day: AsOfDay } | { kind: 'anchor'; anchor: string; today: CalendarDate }

export function calendarDate(moment: number, zone: Zone): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).formatToParts(moment)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return CalendarDate.parse(`${value.year}-${value.month}-${value.day}`)
}

export function asOfZone(asOf: AsOf | undefined, hostZone?: Zone): Zone {
  return asOf?.zone ?? hostZone ?? 'UTC'
}

export function resolveAsOfDay(asOf: AsOf | undefined, facts: AsOfFacts): AsOfResolution {
  if (asOf?.kind === 'fixed') return { kind: 'day', day: { date: asOf.date, zone: facts.zone, kind: 'fixed' } }
  const today = calendarDate(facts.moment, facts.zone)
  if (asOf?.kind === 'anchor') return { kind: 'anchor', anchor: asOf.anchor, today }
  return { kind: 'day', day: { date: today, zone: facts.zone, kind: 'current' } }
}

export function asOfRefusal(anchor: string, reason: string): string {
  return `As-of anchor ${JSON.stringify(anchor)} could not resolve to a calendar date: ${reason}; resolve the anchor to a calendar date to clear this refusal.`
}

export class AsOfRefusedError extends Error {
  override name = 'AsOfRefusedError'
}
