import { z } from 'zod'
import { closedObject } from './closed-object.ts'

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= (monthDays[month - 1] ?? 0)
}

export const CalendarDate = z.string().regex(CALENDAR_DATE, 'must have YYYY-MM-DD form').refine(isCalendarDate, 'must be a real calendar date')
export type CalendarDate = z.infer<typeof CalendarDate>

function isZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const Zone = z.string().refine(isZone, 'must be a time zone accepted by Intl.DateTimeFormat')
export type Zone = z.infer<typeof Zone>

// An absent as-of means the current day.
export const AsOf = z.discriminatedUnion('kind', [
  closedObject({ kind: z.literal('fixed'), date: CalendarDate, zone: Zone.optional() }),
  closedObject({ kind: z.literal('current'), zone: Zone.optional() }),
  closedObject({ kind: z.literal('anchor'), anchor: z.string().min(1), zone: Zone.optional() }),
])
export type AsOf = z.infer<typeof AsOf>

export interface AsOfDay {
  date: CalendarDate
  zone: Zone
  kind: 'fixed' | 'current' | 'anchor'
  anchor?: string
  moment?: number
}
