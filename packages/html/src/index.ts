// HTML as authors write it for pages and slides: the active-content rule, the
// attribute bindings, and the one classification both follow from.

import { hasBindings } from './bindings.ts'
import { elements, parse } from './sanitize.ts'

export type {
  PaginateBlock,
  PaginateBookInput,
  PaginateBookPage,
  PaginateBookRefusal,
  PaginateBookResult,
  PaginateFlow,
  PaginateFlowParents,
  PaginateLine,
  PaginateNote,
  PaginateNoteRef,
  PaginateNoteSeriesGeometry,
  PaginateOpens,
  PaginatePageNote,
  PaginatePageRole,
  PaginateSequence,
  PaginateTarget,
  PaginateTargetPage,
  PaginateWindow,
} from '@segnavia/layout'
export {
  type BookPageFacts,
  type BookPrintedPagePlan,
  type BookPrintedPageRole,
  heldPageNumber,
  openerPageIndex,
  PAGINATE_FUNCTIONS,
  type PrintedPagePlan,
  type PrintedPageSide,
  pageIndexForTarget,
  paginateBook,
  paginateScript,
  planBookPages,
  planPrintedPages,
  selectParent,
  windowPageIndex,
} from '@segnavia/layout'
export { fillAsOfBindings, hasAsOfBinding } from './as-of-bindings.ts'
export { base64ToBytes, bytesToBase64 } from './base64.ts'
export { BINDINGS, bindingNames, bindingPaths, bindingRoot, type Filled, type FillOptions, fill, hasBindings } from './bindings.ts'
export { BLOCK_CONTEXT, type BlockKind, blockContextAllowed } from './block-context.ts'
export type { ContentAddress } from './block-fragments.ts'
export {
  type BlockOpOptions,
  type BlockPosition,
  insertBlock,
  moveBlock,
  removeBlock,
  type SetBlockChange,
  setBlock,
} from './block-ops.ts'
export { type BlockViewEntry, blockView } from './block-view.ts'
export { bookDocument } from './book/book-document.ts'
export {
  BOOK_COLUMN_MAX,
  BOOK_COLUMN_MIN,
  BOOK_FLOW_COLUMN_MIN_PX,
  type BookPositionKey,
  parseBookPositionKey,
} from './book/book-flow.ts'
export { PAGE_REFERENCE_ATTRIBUTE, PAGE_REFERENCE_SELECTOR, PAGE_REFERENCE_VALUE, pageReferenceTarget } from './book/book-page-reference.ts'
export { parseBookFixture } from './book/book-test-fixture.ts'
export { bookView, bookViewFromHtml } from './book/book-view.ts'
export { ABSOLUTE_PX, ABSOLUTE_UNITS, fitRegionSize, lengthPx, parseCssLength } from './book/region-fit.ts'
export type { BookBuild, BookDocument, BookDocumentOptions, BookHeading, BookPrintPart, BookSectionInfo } from './book/types.ts'
export { bookPrintPart, headingLabel } from './book/types.ts'
export { sanitizeBookCss } from './book-css.ts'
export { type BrandSpecimenOptions, brandSpecimen } from './brand-specimen.ts'
export { asOfValues, slotsForDay, slotsOptionsRefusal, slotsWithDay } from './day-slots.ts'
export { type DescribeDocumentOptions, type DocumentDescription, type DocumentDescriptionNode, describeDocument } from './describe-document.ts'
export { BLOCK_ELEMENTS, type ParseDocumentOptions, pageOrPrintedFromInput, parseDocument } from './document.ts'
export type { EditDocumentOptions } from './document-command-core.ts'
export {
  type CommandContentAddress,
  DocumentAddress,
  DocumentCommand,
  DocumentCommandLocation,
  documentCommandJsonSchema,
} from './document-commands.ts'
export {
  type AsOfInputs,
  type DocumentDayContextOptions,
  type DocumentDayContexts,
  type EstablishedPageDay,
  parseAsOfInputs,
  resolveDayContextsFor,
  resolveDocumentDayContexts,
} from './document-day-context.ts'
export { type EditDocumentFailure, type EditDocumentResult, type EditDocumentSuccess, editDocument } from './edit-document.ts'
export { embedFunction } from './embed-function.ts'
export { FontCssRefusedError, fontCss, fontFaceCss } from './font-css.ts'
export { fontFormat } from './font-format.ts'
export { fontReferenceRefusals } from './font-references.ts'
export { fragmentationCss } from './fragmentation.ts'
export { KEEP_WITH_VALUES } from './keep-with.ts'
export type { LinkPolicy } from './link-policy.ts'
export {
  type AlertKind,
  type AlertLabels,
  alertLabels,
  type BodyHtmlOptions,
  type HtmlPage,
  isDiagramFence,
  isGithubAlertBlock,
  isPrintedHtmlPage,
  type MarkdownHeading,
  markdownHtml,
  markdownOutline,
  type PrintedHtmlPage,
  printedPageAuthorHtml,
  printedPageDirection,
  resolvePageHtml,
  resolvePrintedPageHtml,
} from './markdown.ts'
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
export { fillPageAsOfBindings } from './page-as-of.ts'
export {
  classifyMediaAnswer,
  type MediaAnswer,
  PLACEMENT_ATTRIBUTES,
  type PlacementPlan,
  type PlacementPlanEntry,
  type PlacementRefusal,
  type PlacementReport,
  type PlacementsOptions,
  placementCropEdges,
  placementMissingEntry,
  placementPlaceholderSource,
  placementPlan,
  type ResolvedPlacement,
  type ResolvePlacement,
  resolvePlacements,
} from './placements.ts'
export { printedSectionFlows } from './printed-section-flows.ts'
export { type BoundRecordSection, bindRecordValues, type RecordValueSection } from './record-values.ts'
export {
  assetOriginRefusals,
  findActiveContent,
  REFUSED_ELEMENTS,
  type SanitizeOptions,
  safeImageSource,
  safeMarkdownUrl,
  sanitize,
  type UrlPolicy,
} from './sanitize.ts'
export { type CssPreflightFinding, cssPreflightFindings } from './sanitize-css.ts'
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
  fillsSlotValues,
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
export { type CompileStyleSheetOptions, type CompileStyleSheetResult, compileStyleSheet } from './style-compile.ts'
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
