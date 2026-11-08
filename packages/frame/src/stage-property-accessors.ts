import type { BrandsOptions } from './brands.ts'
import { defineElementPropertyAccessors, defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import { defaultFrameTitle, type FrameTitle } from './frame-title.ts'

export interface StagePropertyValues {
  // Styles applied inside every slide, such as a host's house style.
  css: string
  cspExtra: string
  dependencyOrigins: Iterable<string>
  bridgeReadyTimeoutMs: number
  frameTitle: FrameTitle
  brands: BrandsOptions | undefined
}

export function defineStagePropertyAccessors(prototype: object): void {
  defineStylesheetPropertyAccessors(prototype)
  defineElementPropertyAccessors(prototype, () => ({
    bridgeReadyTimeoutMs: 10_000,
    frameTitle: defaultFrameTitle,
    brands: undefined,
  }))
}
