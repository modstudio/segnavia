import type { OriginApproval } from '@segnavia/format'
import type { BrandsOptions } from './brands.ts'
import { defineEditionPropertyAccessor } from './edition-property.ts'
import { defineElementPropertyAccessors, defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import { defaultFrameTitle, type FrameTitle } from './frame-title.ts'
import type { ServeFrame } from './frame-write.ts'

export interface StagePropertyValues {
  // Styles applied inside every slide, such as a host's house style.
  css: string
  cspExtra: string
  origins: Iterable<OriginApproval>
  bridgeReadyTimeoutMs: number
  frameTitle: FrameTitle
  brands: BrandsOptions | undefined
  serveFrame: ServeFrame | undefined
}

export function defineStagePropertyAccessors<T extends object>(prototype: T, changed: (host: T) => void): void {
  defineEditionPropertyAccessor(prototype)
  defineStylesheetPropertyAccessors(prototype)
  defineElementPropertyAccessors(prototype, () => ({
    bridgeReadyTimeoutMs: 10_000,
    frameTitle: defaultFrameTitle,
    brands: undefined,
  }))
  defineElementPropertyAccessors(
    prototype,
    () => ({ serveFrame: undefined as ServeFrame | undefined }),
    (host) => changed(host as T),
  )
}
