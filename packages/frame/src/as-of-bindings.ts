import { AS_OF_CONTEXT, type AsOfDay } from '@segnavia/format'
import { bindingPaths, bindingRoot, fill } from '@segnavia/html'
import { asOfValues } from './day-slots.ts'

export function hasAsOfBinding(html: string): boolean {
  return bindingPaths(html, 'slot').some((path) => bindingRoot(path) === AS_OF_CONTEXT)
}

export function fillAsOfBindings(html: string, day: AsOfDay): string {
  const roots = bindingPaths(html, 'slot')
    .map(bindingRoot)
    .filter((root) => root !== AS_OF_CONTEXT)
  return fill(html, {
    prefix: 'slot',
    data: asOfValues(day),
    deferPaths: roots,
    preserveUnavailable: true,
  }).html
}
