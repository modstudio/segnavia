export { type BookPlanDocumentNumbers, bookPlanDocumentNumbers } from './book-plan-document-numbers.ts'
export { type BookPlanFolioResult, type BookPlanNumbering, type BookPlanPage, type BookPlanSection, bookPlanFolios } from './book-plan-folios.ts'
export { type ConvergedLayout, convergeLayout, type LayoutStep, type LayoutWarning } from './converge-layout.ts'
export { type FitProbe, type FitSearchResult, type FitSearchStrategy, fitSearch, reduceFitGroups } from './fit-search.ts'
export { resolveHeadTemplate } from './head-template.ts'
export { layoutScript } from './layout-script.ts'
export {
  type LineKeyedLabelDecision,
  lineKeyedLabels,
  lineKeyedLabelsScript,
  type NumberedLine,
  numberLines,
  type PageLineNumbers,
  resolveMarginSide,
} from './line-numbers.ts'
export { pageBlockRange } from './page-block-range.ts'
export { PAGINATE_FUNCTIONS, paginateBook, paginateScript } from './paginate-book.ts'
export type { PaginateTarget, PaginateTargetPage } from './paginate-target.ts'
export { heldPageNumber, openerPageIndex, pageIndexForTarget, windowPageIndex } from './paginate-target.ts'
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
  PaginateWindow,
} from './paginate-types.ts'
export * from './parent-selection.ts'
export { type BookPlan, type Measurements, planBook } from './plan-book.ts'
export { type ReplayPlanResult, replayPlan, savePlan } from './plan-save.ts'
export { windowAnchorTop } from './plan-windows.ts'
export * from './printed-pages.ts'
export { type PageSideNotes, type PlacedSideNote, placeSideNotes, stackDownward } from './side-notes.ts'
