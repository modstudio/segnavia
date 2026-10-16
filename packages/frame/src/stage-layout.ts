import type { Deck } from '@segnavia/format'
import { fitSheet } from './fit.ts'

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
  const { scale } = fitSheet({
    width: box.width,
    height: box.height ?? 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    reserveBlockStart: 0,
    reserveBlockEnd: 0,
    sheetWidth: deck.size.width,
    sheetHeight: deck.size.height,
  })
  return { size: deck.size, scale }
}
