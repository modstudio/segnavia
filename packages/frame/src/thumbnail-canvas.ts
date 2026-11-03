import type { Deck, Slide } from '@segnavia/format'
import { documentNeedsSlotFit } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import { defaultFrameTitle } from './frame-title.ts'
import { type PreparedSlots, slotHtml } from './slot-render.ts'
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
  slots?: PreparedSlots,
  // A caller that inspects the slide's animation through its frame needs the bridge to answer.
  reportsAnimation = false,
): HTMLElement {
  const bridge = reportsAnimation || (content.kind === 'html' && documentNeedsSlotFit(slotHtml(content.html, slots)))
  const canvas = stageCanvas(controller, { ...deck, scripts: 'refuse' }, slide, index, content, {
    css,
    csp: '',
    frameTitle: defaultFrameTitle,
    loaded: () => {},
    slots,
    bridge,
  })
  return canvas
}

export function isCurrentThumbnailResolution(resolution: number, current: number): boolean {
  return resolution === current
}
