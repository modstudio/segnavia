import { type AsOfDay, type CalendarDate, formatAsOfMoment, type Zone } from '@segnavia/format'

export type OutputDate = { kind: 'instant'; moment: number; zone: Zone } | { kind: 'date'; date: CalendarDate }

export function outputDate(days: readonly AsOfDay[]): OutputDate | undefined {
  if (days.length !== 1) return undefined
  const [day] = days
  if (!day) return undefined
  if (day.moment !== undefined) return { kind: 'instant', moment: day.moment, zone: day.zone }
  if (day.kind === 'fixed' || day.kind === 'anchor') return { kind: 'date', date: day.date }
  return undefined
}

export function isoDate(date: OutputDate): string {
  return date.kind === 'date' ? date.date : formatAsOfMoment(date.moment, date.zone)
}

export function pdfDate(date: OutputDate): string {
  const iso = isoDate(date)
  if (date.kind === 'date') return `D:${iso.replaceAll('-', '')}`
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([+-])(\d{2}):(\d{2})$/.exec(iso)
  if (!match) throw new RangeError(`The as-of moment formatted as an unexpected value: ${iso}`)
  const [, year, month, day, hour, minute, second, sign, offsetHour, offsetMinute] = match
  return `D:${year}${month}${day}${hour}${minute}${second}${sign}${offsetHour}'${offsetMinute}'`
}
