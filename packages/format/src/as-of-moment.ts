import type { Zone } from './as-of.ts'

function partsFor(moment: number, zone: Zone): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
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
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

/** Formats an instant as ISO 8601 text in the resolved as-of zone. */
export function formatAsOfMoment(moment: number, zone: Zone): string {
  const parts = partsFor(moment, zone)
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName?.replace(/^GMT/, '')
  const fraction = parts.fractionalSecond === '000' ? '' : `.${parts.fractionalSecond}`
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${fraction}${offset}`
}
