import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaPrintedPages } from './printed-pages.ts'

export type { Document, DocumentInput, OriginApproval, PageWidths, PreflightProfileInput, SlotsOptions } from '@segnavia/format'
export type { BrandsOptions } from './brands.ts'
export { HEADLESS_ELEMENTS } from './headless-elements.ts'
export type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
export type { FontsOptions } from './page-fonts.ts'
export { SegnaviaPrintedPages } from './printed-pages.ts'
export { createPrintedPagesElement } from './printed-pages-element.ts'
export type { PrintedPagesFit, PrintedPagesLayout } from './printed-pages-policy.ts'

if (!customElements.get(HEADLESS_ELEMENTS.printedPages)) customElements.define(HEADLESS_ELEMENTS.printedPages, SegnaviaPrintedPages)
