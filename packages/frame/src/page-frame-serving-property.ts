import { defineElementPropertyAccessors } from './element-property-accessors.ts'
import type { ServeFrame } from './frame-write.ts'

export function definePageFrameServing(prototype: object): void {
  defineElementPropertyAccessors(
    prototype,
    () => ({ serveFrame: undefined as ServeFrame | undefined }),
    (host) => {
      const page = host as { pageValue?: import('@segnavia/format').Page; loadValue(page: import('@segnavia/format').Page): void }
      if (page.pageValue) page.loadValue(page.pageValue)
    },
  )
}
