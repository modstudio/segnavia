const PROPERTY_NAMES = new Set(['labels', 'css', 'cspExtra', 'resolveSlide', 'controller', 'transition', 'reserve', 'targetElement'])

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

export function syncElementProps(element: HTMLElement, props: Record<string, unknown>, previous: Record<string, unknown>): () => void {
  const cleanups: Array<() => void> = []
  for (const name of new Set([...Object.keys(previous), ...Object.keys(props)])) {
    if (name === 'children' || name === 'ref' || name === 'key') continue
    const value = props[name]
    if (/^on[A-Z]/.test(name)) {
      if (typeof value === 'function') {
        const listener = value as EventListener
        const type = eventName(name)
        element.addEventListener(type, listener)
        cleanups.push(() => element.removeEventListener(type, listener))
      }
      continue
    }
    if (PROPERTY_NAMES.has(name)) {
      ;(element as unknown as Record<string, unknown>)[name] = value
      continue
    }
    const attribute = attributeName(name)
    if (value === false || value === null || value === undefined) element.removeAttribute(attribute)
    else element.setAttribute(attribute, value === true ? '' : String(value))
  }
  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
