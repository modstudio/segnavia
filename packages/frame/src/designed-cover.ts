import type { SlotsOptions } from '@segnavia/format'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { coverImage } from './cover-element.ts'
import type { CoverPresentation } from './designed-cover-policy.ts'
import { fitDesignedCover } from './fit.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { MountedElement } from './mounted-element.ts'
import { createPageElement } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'
import { projectPageOnPaper } from './paper-geometry.ts'

export function mountDesignedCover(
  presentation: Exclude<CoverPresentation, { kind: 'fallback' }>,
  failed: (error: unknown) => void,
  motifs?: MotifsOptions,
  fonts?: FontsOptions,
  placements?: PlacementsOptions,
  slots?: SlotsOptions,
): MountedElement {
  if (presentation.kind === 'picture') {
    const mounted = coverImage(presentation.src, failed)
    mounted.element.className = 'segnavia-designed-cover'
    return mounted
  }
  const frame = document.createElement('div')
  frame.className = 'segnavia-designed-cover'
  frame.part.add('cover')
  const projection = projectPageOnPaper(presentation.cover.page, presentation.cover.page.print)
  const sheet = document.createElement('div')
  sheet.style.inlineSize = `${projection.box.width}px`
  sheet.style.blockSize = `${projection.box.height}px`
  sheet.style.flex = 'none'
  sheet.style.transformOrigin = 'center'
  const page = createPageElement()
  page.motifs = motifs
  page.fonts = fonts
  page.placements = placements
  page.slots = slots
  page.style.inlineSize = `${projection.box.width}px`
  page.style.blockSize = `${projection.box.height}px`
  page.page = projection.page
  sheet.append(page)
  frame.append(sheet)
  const fit = () => {
    const fitted = fitDesignedCover({ width: frame.clientWidth, height: frame.clientHeight }, projection.box)
    sheet.style.transform = `scale(${fitted.scale})`
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
