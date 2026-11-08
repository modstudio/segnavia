import type { Page, PageWidths, Print, SlotsOptions } from '@segnavia/format'
import type { AssetPlacementsOptions } from './board-policy.ts'
import { internalPageLoad } from './document-value-load.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import { createPageElement } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'
import { projectPageOnPaper } from './paper-geometry.ts'

interface ThumbnailPageOptions {
  motifs?: MotifsOptions
  placements?: AssetPlacementsOptions
  pageWidths?: PageWidths
  fonts?: FontsOptions
  slots?: SlotsOptions
  css: string
}

export function updateThumbnailPageAspect(style: CSSStyleDeclaration, page: Page | null, print: Print | null, hasDeck: boolean): void {
  const resolvedPrint = print ?? page?.print ?? null
  if (!page || !resolvedPrint) {
    if (!hasDeck) style.removeProperty('--segnavia-aspect')
    return
  }
  style.setProperty('--segnavia-aspect', String(projectPageOnPaper(page, resolvedPrint).aspect))
}

export function mountThumbnailPage(viewport: HTMLElement, source: Page | null, print: Print | null, options: ThumbnailPageOptions): void {
  const resolvedPrint = print ?? source?.print ?? null
  if (!source || !resolvedPrint || viewport.firstElementChild) return
  const page = createPageElement()
  page.motifs = options.motifs
  page.placements = options.placements
  page.pageWidths = options.pageWidths
  page.fonts = options.fonts
  page.slots = options.slots
  page.css = options.css
  page.cspExtra = ''
  page.part.add('canvas')
  page.style.inlineSize = '100%'
  viewport.append(page)
  page[internalPageLoad](projectPageOnPaper(source, resolvedPrint).page)
}
