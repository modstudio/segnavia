import type { PageWidths } from '@segnavia/format'
import { Page, type PreflightProfile } from '@segnavia/format'
import type { EstablishedPageDay } from '@segnavia/html'
import type { BrandsOptions } from './brands.ts'
import { installDocumentPagePreflight } from './document-page-preflight.ts'
import { internalPageDayLoad } from './document-value-load.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import { createPageElement } from './page-element.ts'
import type { FontsOptions } from './page-fonts.ts'
import type { PreparedSlots } from './slot-render.ts'

interface DocumentPageMountOptions {
  context: EstablishedPageDay
  page: Page
  html: string
  resolvedSlots?: PreparedSlots
  motifs?: MotifsOptions
  placements?: PlacementsOptions
  pageWidths?: PageWidths
  fonts?: FontsOptions
  brands?: BrandsOptions
  css: string
  csp: string
  origins: import('@segnavia/format').OriginApproval[]
  profile: PreflightProfile
  preflight(report: import('@segnavia/format').PreflightReport): void
}

export function mountDocumentPage(sheet: HTMLElement, options: DocumentPageMountOptions): void {
  const element = createPageElement()
  element.motifs = options.motifs
  element.placements = options.placements
  element.pageWidths = options.pageWidths
  element.fonts = options.fonts
  element.brands = options.brands
  element.css = options.css
  element.cspExtra = options.csp
  element.origins = options.origins
  element.profile = options.profile
  element.part.add('page')
  installDocumentPagePreflight(element, options.preflight)
  sheet.append(element)
  element[internalPageDayLoad](
    Page.parse({
      ...options.page,
      printedPages: undefined,
      slots: options.resolvedSlots ? [] : options.page.slots,
      html: options.html,
    }),
    options.context,
  )
}
