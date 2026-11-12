import type { Deck, OriginApproval, Slide } from '@segnavia/format'
import { documentNeedsSlotFit } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import { deckFolioAt, deckFolios } from './deck-folios.ts'
import { dispatchElementError } from './element-error.ts'
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
  origins?: Iterable<OriginApproval>,
  // A caller that inspects the slide's animation through its frame needs the bridge to answer.
  reportsAnimation = false,
): HTMLElement {
  const bridge = reportsAnimation || (content.kind === 'html' && documentNeedsSlotFit(slotHtml(content.html, slots)))
  const folio = deckFolioAt(deckFolios(deck), index)
  let canvas: HTMLElement
  canvas = stageCanvas(controller, { ...deck, scripts: 'refuse' }, slide, content, {
    css,
    csp: '',
    origins,
    frameTitle: defaultFrameTitle,
    loaded: () => {},
    failed: (error) => dispatchElementError(canvas, error),
    slots,
    bridge,
    folio,
  })
  return canvas
}

export function isCurrentThumbnailResolution(resolution: number, current: number): boolean {
  return resolution === current
}
