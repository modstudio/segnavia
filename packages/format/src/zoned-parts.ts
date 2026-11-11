import type { Zone } from './as-of.ts'

export interface ZonedParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  fractionalSecond: string
  offset: string
}

function refusal(subject: string, remedy: string): RangeError {
  return new RangeError(`The as-of moment could not establish ${subject}; ${remedy} to clear this refusal.`)
}

function requiredPart(parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>>, name: Intl.DateTimeFormatPartTypes): string {
  const value = parts[name]
  if (value === undefined) throw refusal(`the zoned ${name}`, `use an Intl runtime that supplies the ${name} part`)
  return value
}

/** Reads an instant as Gregorian date, time and offset parts in a stated zone. */
export function zonedParts(moment: number, zone: Zone): ZonedParts {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    era: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(moment)
  const parts = Object.fromEntries(formatted.map((part) => [part.type, part.value])) as Partial<Record<Intl.DateTimeFormatPartTypes, string>>
  const statedYear = Number(parts.year)
  const year = parts.era === 'BC' ? 1 - statedYear : statedYear
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw refusal('a year in the ISO 8601 range 0000 through 9999', 'supply a moment within that year range')
  }
  if (parts.timeZoneName === undefined) {
    throw refusal("the resolved zone's UTC offset", 'use an Intl runtime that supplies the long offset for the resolved zone')
  }
  return {
    year: String(year).padStart(4, '0'),
    month: requiredPart(parts, 'month'),
    day: requiredPart(parts, 'day'),
    hour: requiredPart(parts, 'hour'),
    minute: requiredPart(parts, 'minute'),
    second: requiredPart(parts, 'second'),
    fractionalSecond: requiredPart(parts, 'fractionalSecond'),
    offset: parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace(/^GMT/, ''),
  }
}
