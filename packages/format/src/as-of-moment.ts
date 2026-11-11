import type { Zone } from './as-of.ts'
import { zonedParts } from './zoned-parts.ts'

/** Formats an instant as ISO 8601 text in the resolved as-of zone. */
export function formatAsOfMoment(moment: number, zone: Zone): string {
  const parts = zonedParts(moment, zone)
  const fraction = parts.fractionalSecond === '000' ? '' : `.${parts.fractionalSecond}`
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${fraction}${parts.offset}`
}
