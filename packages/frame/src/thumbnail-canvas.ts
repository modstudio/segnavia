import type { Deck, Slide } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { defaultFrameTitle } from './frame-title.ts'
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
): HTMLElement {
  const canvas = stageCanvas(controller, { ...deck, scripts: 'refuse' }, slide, index, content, css, '', defaultFrameTitle, () => {})
  canvas.querySelector('iframe')?.setAttribute('sandbox', bridge ? 'allow-scripts' : '')
  return canvas
}

export function isCurrentThumbnailResolution(resolution: number, current: number): boolean {
  return resolution === current
}
