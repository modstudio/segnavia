import { AS_OF_CONTEXT, type AsOfDay } from '@segnavia/format'
import { bindingNames, bindingPaths, bindingRoot, fill } from './bindings.ts'
import { asOfValues } from './day-slots.ts'
import { elements, parse } from './sanitize.ts'
import { refusesValueBinding } from './slots.ts'

export function hasAsOfBinding(html: string): boolean {
  return bindingPaths(html, 'slot').some((path) => bindingRoot(path) === AS_OF_CONTEXT)
}

export function fillAsOfBindings(html: string, day: AsOfDay | undefined): string {
  if (!day || !hasAsOfBinding(html)) return html
  const valueName = bindingNames('slot').value
  for (const element of elements(parse(html).children)) {
    const path = element.attribs[valueName]
    const tag = element.name.toLowerCase()
    if (path !== undefined && bindingRoot(path) === AS_OF_CONTEXT && refusesValueBinding(tag)) {
      throw new RangeError(`Slot "${path}" uses a value binding on <${tag}>, whose content cannot be filled safely.`)
    }
  }
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
