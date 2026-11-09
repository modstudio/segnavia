import type { AsOfDay } from '@segnavia/format'
import { bindingPaths, bindingRoot, fill } from '@segnavia/html'

export function hasAsOfBinding(html: string): boolean {
  return bindingPaths(html, 'slot').some((path) => bindingRoot(path) === 'asOf')
}

export function fillAsOfBindings(html: string, day: AsOfDay): string {
  const roots = bindingPaths(html, 'slot')
    .map(bindingRoot)
    .filter((root) => root !== 'asOf')
  return fill(html, {
    prefix: 'slot',
    data: { asOf: { date: day.date, zone: day.zone, ...(day.anchor === undefined ? {} : { anchor: day.anchor }) } },
    deferPaths: roots,
    preserveUnavailable: true,
  }).html
}
