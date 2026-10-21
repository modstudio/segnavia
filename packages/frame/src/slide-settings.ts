import type { Slide } from '@segnavia/format'
import type { PlayerLabels } from './labels.ts'

export interface SlideSettingInfo {
  animated: boolean
  lengthMs: number | null
}

export interface SlideSettingPanelContext {
  slide: Slide
  info: SlideSettingInfo
}

export interface SlideSetting {
  id: string
  label: string
  description: string
  appliesTo: (slide: Slide, info: SlideSettingInfo) => boolean
  valueLabel: (slide: Slide) => string
  panel: (context: SlideSettingPanelContext) => void | Promise<void>
}

export function slideSettings(labels: PlayerLabels, openPrintFrame: SlideSetting['panel']): readonly SlideSetting[] {
  return [
    {
      id: 'print-frame',
      label: labels.printFrame,
      description: labels.printFrameDescription,
      appliesTo: (slide, info) => slide.content.kind === 'html' && info.animated,
      valueLabel: (slide) => (slide.printAtMs === undefined ? labels.printFrameStart : labels.printFrameAt(seconds(slide.printAtMs))),
      panel: openPrintFrame,
    },
  ]
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}
