import type { RuntimeElementDescriptor } from './elements.ts'

function attributeName(name: string): string {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function eventName(name: string): string {
  return name
    .slice(2)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

function syncValue(element: HTMLElement, properties: Set<string>, name: string, value: unknown, previous: unknown) {
  if (Object.is(value, previous)) return
  if (properties.has(name)) {
    ;(element as unknown as Record<string, unknown>)[name] = value
    return
  }
  const attribute = attributeName(name)
  if (value === false || value === null || value === undefined) element.removeAttribute(attribute)
  else element.setAttribute(attribute, value === true ? '' : String(value))
}

export function syncElementProps(
  descriptor: RuntimeElementDescriptor,
  element: HTMLElement,
  props: Record<string, unknown>,
  previous: Record<string, unknown>,
): () => void {
  const cleanups: Array<() => void> = []
  const properties = new Set(descriptor.properties)
  for (const name of new Set([...Object.keys(previous), ...Object.keys(props)])) {
    if (name === 'children' || name === 'ref' || name === 'key') continue
    const value = props[name]
    if (/^on[A-Z]/.test(name)) {
      if (typeof value === 'function') {
        const listener = value as EventListener
        const type = descriptor.events[name] ?? eventName(name)
        element.addEventListener(type, listener)
        cleanups.push(() => element.removeEventListener(type, listener))
      }
      continue
    }
    syncValue(element, properties, name, value, previous[name])
  }
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
