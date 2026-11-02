import { sheetMm } from '@segnavia/format'
import type { CoverPresentation, AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { fitSheet } from './fit.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import { SegnaviaPage } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'

export interface MountedDesignedCover {
  element: HTMLElement
  dispose(): void
}

export function mountDesignedCover(
  presentation: Exclude<CoverPresentation, { kind: 'fallback' }>,
  failed: (error: unknown) => void,
  motifs?: MotifsOptions,
  fonts?: FontsOptions,
  placements?: PlacementsOptions,
): MountedDesignedCover {
  if (presentation.kind === 'picture') {
    const image = document.createElement('img')
    image.src = presentation.src
    image.alt = ''
    image.part.add('cover')
    image.className = 'segnavia-designed-cover'
    return { element: image, dispose() {} }
  }
  const frame = document.createElement('div')
  frame.className = 'segnavia-designed-cover'
  frame.part.add('cover')
  const page = new SegnaviaPage()
  page.motifs = motifs
  page.fonts = fonts
  page.placements = placements
  page.page = presentation.cover.page
  frame.append(page)
  const sheet = sheetMm(presentation.cover.page.print)
  const fit = () => {
    const size = fitSheet({
      width: frame.clientWidth,
      height: frame.clientHeight,
      paddingInlineStart: 0,
      paddingInlineEnd: 0,
      reserveBlockStart: 0,
      reserveBlockEnd: 0,
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
    })
    page.style.inlineSize = `${size.width}px`
    page.style.blockSize = `${size.height}px`
  }
  const observer = new ResizeObserver(fit)
  observer.observe(frame)
  const onError = (event: Event) => failed((event as ErrorEvent).error ?? (event as ErrorEvent).message)
  page.addEventListener('error', onError)
  fit()
  return {
    element: frame,
    dispose() {
      observer.disconnect()
      page.removeEventListener('error', onError)
    },
  }
}
