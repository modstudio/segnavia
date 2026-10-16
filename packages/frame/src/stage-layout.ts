import type { Deck } from '@segnavia/format'

export interface StageBox {
  width: number
  height?: number
}

export interface StageCanvasLayout {
  size: { width: number; height: number }
  scale: number
}

/** Decides the unscaled canvas and its display scale from a stage box. */
export function stageCanvasLayout(deck: Pick<Deck, 'layout' | 'size'>, box: StageBox): StageCanvasLayout {
  if (deck.layout === 'responsive') {
    const width = Math.max(0, Math.round(box.width))
    const height = box.height && box.height > 0 ? Math.round(box.height) : Math.round(width * (deck.size.height / deck.size.width))
    return { size: { width, height }, scale: 1 }
  }
  const byWidth = box.width / deck.size.width
  const byHeight = box.height && box.height > 0 ? box.height / deck.size.height : byWidth
  return { size: deck.size, scale: Math.max(0, Math.min(byWidth, byHeight)) }
}
