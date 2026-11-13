// The slim headless page entry point registers only the page element at load.

import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaPage } from './page.ts'

export type { Document, DocumentInput, OriginApproval, Page, PageWidths, PreflightProfileInput, SlotsOptions } from '@segnavia/format'
export type { AlertLabels } from '@segnavia/html'
export type { AsOfElementProperties } from './as-of-element.ts'
export type { BrandsOptions } from './brands.ts'
export type { PageSelection } from './bridge-selection.ts'
export { HEADLESS_ELEMENTS } from './headless-elements.ts'
export type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
export { SELECTION_REPLY_MS, SegnaviaPage } from './page.ts'
export { createPageElement } from './page-element.ts'
export type { FontsOptions } from './page-fonts.ts'

if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)
