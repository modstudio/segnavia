import type { ServeFrame } from './frame-write.ts'

const values = new WeakMap<object, ServeFrame>()

export function defineServeFrameProperty<T extends object>(prototype: T, changed: (host: T) => void): void {
  Object.defineProperty(prototype, 'serveFrame', {
    configurable: true,
    get(this: T) {
      return values.get(this)
    },
    set(this: T, value: ServeFrame | undefined) {
      if (value) values.set(this, value)
      else values.delete(this)
      changed(this)
    },
  })
}
