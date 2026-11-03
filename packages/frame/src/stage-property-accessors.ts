import { defineElementPropertyAccessors } from './element-property-accessors.ts'
import { defaultFrameTitle, type FrameTitle } from './frame-title.ts'

export interface StagePropertyValues {
  // Styles applied inside every slide, such as a host's house style.
  css: string
  cspExtra: string
  dependencyOrigins: Iterable<string>
  bridgeReadyTimeoutMs: number
  frameTitle: FrameTitle
}

export function defineStagePropertyAccessors(prototype: object): void {
  defineElementPropertyAccessors<StagePropertyValues>(prototype, () => ({
    css: '',
    cspExtra: '',
    dependencyOrigins: [],
    bridgeReadyTimeoutMs: 10_000,
    frameTitle: defaultFrameTitle,
  }))
}
