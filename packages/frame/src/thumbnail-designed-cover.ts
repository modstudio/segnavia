import type { SlotsOptions } from '@segnavia/format'
import type { AssetPlacementsOptions } from './board-policy.ts'
import type { CoverPresentation } from './designed-cover-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { MountedElement } from './mounted-element.ts'
import type { FontsOptions } from './page-fonts.ts'

interface CoverViewport {
  firstElementChild: Element | null
  append(element: HTMLElement): void
}

export function thumbnailCoverSources(
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  placements: AssetPlacementsOptions | undefined,
  slots: SlotsOptions | undefined,
) {
  return { motifs, fonts, placements, slots }
}

export function mountThumbnailDesignedCover(
  viewport: CoverViewport,
  presentation: CoverPresentation,
  mount: (presentation: Exclude<CoverPresentation, { kind: 'fallback' }>) => MountedElement,
): MountedElement | undefined {
  if (presentation.kind === 'fallback' || viewport.firstElementChild) return undefined
  const mounted = mount(presentation)
  viewport.append(mounted.element)
  return mounted
}
