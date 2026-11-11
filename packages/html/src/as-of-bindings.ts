import { AS_OF_CONTEXT, AS_OF_MOMENT_PATH, type AsOfDay } from '@segnavia/format'
import { bindingNames, bindingPaths, bindingRoot, fill } from './bindings.ts'
import { asOfValues } from './day-slots.ts'
import { elements, parse, serialize } from './sanitize.ts'
import { refusesValueBinding } from './slots.ts'

export function hasAsOfBinding(html: string): boolean {
  return bindingPaths(html, 'slot').some((path) => bindingRoot(path) === AS_OF_CONTEXT)
}

export function fillAsOfBindings(html: string, day: AsOfDay | undefined): string {
  if (!day || !hasAsOfBinding(html)) return html
  const valueName = bindingNames('slot').value
  const document = parse(html)
  for (const element of elements(document.children)) {
    const path = element.attribs[valueName]
    const tag = element.name.toLowerCase()
    if (path !== undefined && bindingRoot(path) === AS_OF_CONTEXT && refusesValueBinding(tag)) {
      throw new RangeError(`Slot "${path}" uses a value binding on <${tag}>, whose content cannot be filled safely.`)
    }
    if (path === AS_OF_MOMENT_PATH) element.attribs.dir = 'ltr'
  }
  const roots = bindingPaths(html, 'slot')
    .map(bindingRoot)
    .filter((root) => root !== AS_OF_CONTEXT)
  return fill(serialize(document), {
    prefix: 'slot',
    data: asOfValues(day),
    deferPaths: roots,
    preserveUnavailable: true,
  }).html
}
