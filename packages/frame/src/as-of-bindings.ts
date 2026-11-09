import type { AsOfDay } from '@segnavia/format'
import { bindingRoot, fill } from '@segnavia/html'

const SLOT_BINDING = /data-slot-(?:value|href|src|present|when|each|width)=["']([^"']+)["']/g

export function fillAsOfBindings(html: string, day: AsOfDay): string {
  const roots = [...html.matchAll(SLOT_BINDING)].map((match) => bindingRoot(match[1] ?? '')).filter((root) => root !== 'asOf')
  return fill(html, {
    prefix: 'slot',
    data: { asOf: { date: day.date, zone: day.zone, ...(day.anchor === undefined ? {} : { anchor: day.anchor }) } },
    deferPaths: roots,
    preserveUnavailable: true,
  }).html
}
