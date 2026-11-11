import type { Deck } from '@segnavia/format'
import type { FittedSize } from './fit.ts'
import { layoutStageCanvas } from './stage-content.ts'
import { stageCanvasLayout } from './stage-layout.ts'
import type { StageReserve } from './stage-reserve.ts'

export function measureStage(
  host: HTMLElement,
  deck: Deck,
  room: StageReserve,
  fit: 'box' | 'viewport',
  ownedViewportBlockSize: boolean,
): { fitted: FittedSize; ownsViewportBlockSize: boolean } | undefined {
  const canvas = host.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
  if (!canvas) return undefined
  let box: { width: number; height: number }
  let ownsViewportBlockSize = ownedViewportBlockSize
  if (fit === 'viewport') {
    const style = getComputedStyle(host)
    const presenting = host.closest<HTMLElement>('[data-presenting]')
    const blockAvailable = presenting ? presenting.clientHeight : window.innerHeight - host.getBoundingClientRect().top
    box = {
      width: Math.max(0, host.clientWidth - (Number.parseFloat(style.paddingInlineStart) || 0) - (Number.parseFloat(style.paddingInlineEnd) || 0)),
      height: Math.max(0, blockAvailable - (room.blockStart ?? 0) - (room.blockEnd ?? 0)),
    }
  } else {
    box = { width: host.clientWidth, height: host.clientHeight }
    if (ownsViewportBlockSize) {
      host.style.removeProperty('block-size')
      ownsViewportBlockSize = false
    }
  }
  const layout = stageCanvasLayout(deck, box)
  const fitted: FittedSize = { scale: layout.scale, width: layout.size.width * layout.scale, height: layout.size.height * layout.scale }
  if (fit === 'viewport') {
    host.style.blockSize = `${fitted.height}px`
    ownsViewportBlockSize = true
  }
  for (const item of host.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')) {
    layoutStageCanvas(item, layout.size)
    item.style.transform = `scale(${fitted.scale})`
    item.style.setProperty('--segnavia-transition-scale', String(fitted.scale))
  }
  return { fitted, ownsViewportBlockSize }
}
