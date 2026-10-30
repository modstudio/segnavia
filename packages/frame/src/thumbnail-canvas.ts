import type { Deck, Slide } from '@segnavia/format'
import { frameSandbox } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import { defaultFrameTitle } from './frame-title.ts'
import type { PreparedSlots } from './slot-render.ts'
import { stageCanvas } from './stage-content.ts'

export function thumbnailScale(width: number, deckWidth: number): number {
  return width / deckWidth
}

export function thumbnailCanvas(
  controller: DeckController,
  deck: Deck,
  slide: Slide,
  index: number,
  content: ResolvedContent,
  css = '',
  bridge = false,
  slots?: PreparedSlots,
): HTMLElement {
  const canvas = stageCanvas(controller, { ...deck, scripts: 'refuse' }, slide, index, content, {
    css,
    csp: '',
    frameTitle: defaultFrameTitle,
    loaded: () => {},
    slots,
  })
  canvas.querySelector('iframe')?.setAttribute('sandbox', bridge ? frameSandbox('refuse') : '')
  return canvas
}

export function isCurrentThumbnailResolution(resolution: number, current: number): boolean {
  return resolution === current
}
