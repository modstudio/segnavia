import type { FontsOptions } from './page-fonts.ts'

const values = new WeakMap<object, FontsOptions | undefined>()

export function stageFontsInput(host: object): FontsOptions | undefined {
  return values.get(host)
}

export function defineStageFontsProperty<T extends object>(prototype: T, changed: (host: T) => void): void {
  Object.defineProperty(prototype, 'fonts', {
    configurable: true,
    get(this: object) {
      return stageFontsInput(this)
    },
    set(this: T, value: FontsOptions | undefined) {
      if (values.get(this) === value) return
      values.set(this, value)
      changed(this)
    },
  })
}
