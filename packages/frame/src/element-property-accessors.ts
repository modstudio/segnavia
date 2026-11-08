export function defineElementPropertyAccessors<T extends object>(prototype: object, defaults: () => T): void {
  const values = new WeakMap<object, T>()
  const valueFor = (element: object) => {
    const current = values.get(element)
    if (current) return current
    const created = defaults()
    values.set(element, created)
    return created
  }
  for (const name of Object.keys(defaults()) as (keyof T)[]) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      enumerable: false,
      get(this: object) {
        return valueFor(this)[name]
      },
      set(this: object, value: T[typeof name]) {
        valueFor(this)[name] = value
      },
    })
  }
}

interface StylesheetPropertyValues {
  css: string
  cspExtra: string
  origins: Iterable<OriginApproval>
}

export function defineStylesheetPropertyAccessors(
  prototype: object,
  properties: readonly (keyof StylesheetPropertyValues)[] = ['css', 'cspExtra', 'origins'],
): void {
  defineElementPropertyAccessors(prototype, () => {
    const defaults: StylesheetPropertyValues = { css: '', cspExtra: '', origins: [] }
    return Object.fromEntries(properties.map((name) => [name, defaults[name]])) as Partial<StylesheetPropertyValues>
  })
}

import type { OriginApproval } from '@segnavia/format'
