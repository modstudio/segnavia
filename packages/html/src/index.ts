// HTML as authors write it for pages and slides: the active-content rule, the
// attribute bindings, and the one classification both follow from.

import { hasBindings } from './bindings.ts'
import { elements, parse } from './sanitize.ts'

export { base64ToBytes, bytesToBase64 } from './base64.ts'
export { BINDINGS, bindingNames, bindingRoot, type Filled, type FillOptions, fill, hasBindings } from './bindings.ts'
export { bookDocument } from './book/book-document.ts'
export {
  BOOK_COLUMN_MAX,
  BOOK_COLUMN_MIN,
  BOOK_FLOW_COLUMN_MIN_PX,
  type BookPositionKey,
  parseBookPositionKey,
} from './book/book-flow.ts'
export { bookView, bookViewFromHtml } from './book/book-view.ts'
export { type BookFurnitureValues, embedFunction, fillBookFurniture, furnitureScript } from './book/furniture.ts'
export { PAGINATE_FUNCTIONS, paginateBook, paginateScript } from './book/paginate-book.ts'
export type { PaginateTarget, PaginateTargetPage } from './book/paginate-target.ts'
export { heldPageNumber, openerPageIndex, pageIndexForTarget, windowPageIndex } from './book/paginate-target.ts'
export type {
  PaginateBlock,
  PaginateBookInput,
  PaginateBookPage,
  PaginateBookRefusal,
  PaginateBookResult,
  PaginateFlow,
  PaginateFlowParents,
  PaginateLine,
  PaginateMark,
  PaginateNote,
  PaginateNoteRef,
  PaginateOpens,
  PaginatePageMarks,
  PaginatePageNote,
  PaginatePageRole,
  PaginateSequence,
  PaginateWindow,
} from './book/paginate-types.ts'
export { ABSOLUTE_PX, ABSOLUTE_UNITS, fitRegionSize, lengthPx, parseCssLength } from './book/region-fit.ts'
export type { BookBuild, BookDocument, BookDocumentOptions, BookHeading, BookPrintPart, BookSectionInfo } from './book/types.ts'
export { bookPrintPart } from './book/types.ts'
export { bookStylesheet, sanitizeBookCss } from './book-css.ts'
export { FontCssRefusedError, fontCss, fontFaceCss } from './font-css.ts'
export { fontFormat } from './font-format.ts'
export { fontReferenceRefusals } from './font-references.ts'
export {
  documentLanguage,
  type ExpandedMotifs,
  type ExpandMotifsOptions,
  expandMotifs,
  hasHostMotifPlacement,
  hasMotifPlacement,
  libraryMotifPlacementRefusal,
  MOTIF_DEPTH_LIMIT,
  MotifRefusedError,
  motifPlacementRefusals,
  type PlacedMotif,
  renderMotifPlacements,
} from './motifs.ts'
export * from './printed-pages.ts'
export { findActiveContent, REFUSED_ELEMENTS, type SanitizeOptions, sanitize } from './sanitize.ts'
export {
  assertSingleSlotCopy,
  assertSlotPrintOptions,
  collectSlotPrintCopies,
  isSlotCopyRefusal,
  type SlotFillEntry,
  type SlotFillRefusal,
  SlotFillsConflictError,
  SlotFillsRefusedError,
  type SlotPrintOptions,
  slotFillCopyId,
  slotFillsConflict,
} from './slot-print.ts'
export {
  hasSlotWork,
  MAX_SLOT_DECLARATIONS,
  mergeSlotFitResults,
  type PreparedSlots,
  prepareSlotCollection,
  prepareSlots,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  SlotFillRefusedError,
  slotFillRefusal,
  UnmeasuredSlotsRefusedError,
  unmeasuredSlotRefusal,
} from './slots.ts'
export { parseUnicodeRange, UNICODE_RANGE_CLEARANCE, type UnicodeRangeParse } from './unicode-range.ts'

// How a page runs, decided only by what it holds: plain, filled from data,
// running its own code, or both, which is refused.
export type HtmlKind = 'plain' | 'live-data' | 'scripted' | 'refused'

export function classify(html: string, prefix: string): HtmlKind {
  const scripted = elements(parse(html).children).some((element) => element.name.toLowerCase() === 'script')
  const bound = hasBindings(html, prefix)
  if (scripted && bound) return 'refused'
  if (scripted) return 'scripted'
  return bound ? 'live-data' : 'plain'
}

// The text a search reads: what a person sees, without markup, styles or code.
export function searchText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
