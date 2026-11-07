// The shapes every package agrees on. Hosts read and write these as JSON, so
// each is a Zod schema and the JSON Schema is generated from it (`jsonSchemas`)
// for hosts that do not run TypeScript.

export { Board, BoardItem, BoardLabel, BoardSection, GridCell } from './board.ts'
export type { BoardCommandOptions } from './board-command-core.ts'
export { DEFAULT_BOARD_ITEM_WIDTH } from './board-command-items.ts'
export {
  BoardCommand,
  type BoardCommandOf,
  BoardEntityRef,
  BoardItemRef,
  BoardSectionRef,
  BoardTarget,
  PlacementTarget,
} from './board-commands.ts'
export {
  type BoardDescription,
  type BoardDescriptionCell,
  type BoardDescriptionEntity,
  type BoardDescriptionEntityKind,
  type BoardDescriptionItem,
  type BoardDescriptionLabel,
  type BoardDescriptionMember,
  type BoardDescriptionOverlap,
  type BoardDescriptionSection,
  type DescribeBoardOptions,
  describeBoard,
} from './board-describe.ts'
export {
  addItem,
  type BoardItemAnchor,
  MIN_BOARD_ITEM_WIDTH,
  moveItems,
  moveSection,
  removeItems,
  resizeItem,
} from './board-edit.ts'
export type {
  BoardChangedEntity,
  BoardChangedKind,
  BoardEditAdjustment,
  BoardEditAdjustmentKind,
  BoardEditFailure,
  BoardEditResult,
  BoardEditSuccess,
} from './board-edit-result.ts'
export {
  type ArrangeOptions,
  arrange,
  type BoardShapes,
  type BoardView,
  boardBounds,
  boardToScreen,
  itemAt,
  itemHeight,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  revealView,
  screenToBoard,
  visibleItems,
  type ZoomBounds,
  zoomAt,
  zoomToFit,
} from './board-geometry.ts'
export { type BoardListingGroup, boardListing, boardListingIsEmpty, foldForSearch, nameMatches } from './board-listing.ts'
export { applyBoardOps, BoardOp, invertOps, SectionFields } from './board-ops.ts'
export { diffBoards } from './board-ops-diff.ts'
export {
  deriveSectionCells,
  type GridDropTarget,
  gridDropMarkerBox,
  gridDropTarget,
  insertIntoGrid,
  layoutSection,
  removeFromGrid,
} from './board-section-grid.ts'
export {
  assignMembership,
  fitSection,
  fitTouchedSections,
  MAKE_ROOM_LIMIT,
  makeRoom,
  SECTION_GAP,
  SECTION_MIN_SIZE,
  SECTION_PADDING,
  SECTION_TITLE_ROOM,
  settleBoard,
} from './board-sections.ts'
export {
  BOARD_LABEL_ESTIMATE,
  type BoardItemFact,
  type BoardShapesOptions,
  boardShapes,
  type ComputedBoardShapes,
  type LabelShapeResult,
  labelShape,
  provisionalShape,
  resolvedShape,
} from './board-shapes.ts'
export * from './book-exports.ts'
export {
  COVER_DRAWING_VERSION,
  COVER_SHEET,
  Cover,
  type CoverDigestMaterial,
  type CoverInput,
  coverDigest,
  digestCoverMaterial,
} from './cover.ts'
export {
  Annotation,
  annotationCueIssues,
  Box,
  Cue,
  DECK_SIZE,
  Deck,
  exceedsLimits,
  ImageFit,
  Manifest,
  MeasuredSize,
  Narration,
  PixelSize,
  PLAYBACK_MODES,
  Playback,
  type PlaybackMode,
  Point,
  PublishedShot,
  parsePlayback,
  SHOT_KEY,
  Shot,
  Slide,
  SlideContent,
  Word,
} from './deck.ts'
export { type DeckFromSlidesOptions, deckFromSlides, type SlideRow } from './deck-from-slides.ts'
export { type DependencyDecision, dependencyDecision, dependencyOriginSet, originSet } from './dependency-policy.ts'
export { Direction, firstStrongDirection, htmlTextSample, languageDirection, resolveDirection, TextDirection, textDirection } from './direction.ts'
export { Document, type DocumentInput, type DocumentKind, type DocumentParseOptions } from './document.ts'
export {
  boardFromDocument,
  bookFromDocument,
  deckFromDocument,
  documentFromBoard,
  PAGE_OR_PRINTED_KINDS,
  type PageOrPrintedInput,
  pageFromDocument,
  pageOrPrintedFromDocument,
  pageOrPrintedFromInput,
  printedFromDocument,
} from './document-lowering.ts'
export * from './document-metadata.ts'
export { editBoard } from './edit-board.ts'
export { EXPORTED_SCHEMAS } from './exported-schema-manifest.ts'
export { FOLD_KINDS, FOLD_TUCK_IN_MM, type FoldKind, foldCellPages, foldColumns, foldPageCountMessage, foldPanelMap } from './fold.ts'
export { computeFolios, type Folio, folioScript, type NumberedPage, Numbering, sequenceFolios } from './folio.ts'
export { collectionFaces, type ExtractedFontFace, extractFace } from './font-collection.ts'
export { type ResolvedFontFace, resolveFontFace } from './font-face.ts'
export { FontFaceRefusedError } from './font-refusal.ts'
export { COLLECTION_TAG, classifyFont } from './font-signature.ts'
export {
  APP_FONT_NAME,
  APP_FONT_NAME_MESSAGE,
  type AppFont,
  FONT_FORMATS,
  FONT_GENERICS,
  type FontFace,
  type FontFormat,
  type FontGeneric,
  FontReference,
  FontReferenceInput,
  type FontSource,
  type LocalFacesInput,
  LocalFacesTransport,
  LocalFaceTransport,
  localFontReferences,
} from './fonts.ts'
export {
  fitPage,
  type Imposed,
  type ImpositionPlacement,
  impose,
  type MillimeterEdges,
  mirrorPlacement,
  type PageFit,
  type PagePlacementKind,
  type PagePlacementLayout,
  pagePlacementLayout,
} from './imposition.ts'
export { PAPER_FIT_TOLERANCE_MM } from './imposition-fit.ts'
export {
  type ImpositionMarkEdge,
  type ImpositionSideMarks,
  impositionMarks,
  MIN_MARK_LENGTH_MM,
  type OmittedImpositionMark,
} from './imposition-marks.ts'
export { Imposition, type ImpositionInput, MAX_IMPOSITION_CELLS } from './imposition-schema.ts'
export { jsonSchemas } from './json-schemas.ts'
export { Lexicon, lexiconVersion, PronunciationEntry } from './lexicon.ts'
export {
  DEFAULT_LIMITS,
  DEFAULT_PAGE_LIMIT,
  type DocumentLimits,
  fillLimitRefusal,
  LIMIT_ACTUAL_PLACEHOLDER,
  type LimitMeasure,
  type LimitRefusalOptions,
  type Limits,
  type LocalFontLimitFace,
  limitRefusal,
  limitRefusalTemplate,
  localFontLimitRefusal,
  type PageLimitSource,
  parseLimits,
  type ResolvedLimits,
  resolveLimits,
} from './limits.ts'
export { LogicalMargin, type PageSide, PhysicalMargin, physicalMargins } from './margins.ts'
export {
  MEDIA_FORMATS,
  Media,
  MediaFormat,
  type MediaInput,
  MediaPage,
  MediaText,
  mediaTextDirection,
  PageSelector,
  PointSize,
} from './media.ts'
export * from './motif.ts'
export * from './numbering.ts'
export {
  FlowingWidth,
  FULL_PAGE_SIZE,
  PAGE_WIDTHS,
  Page,
  PageBody,
  PageSize,
  PageWidths,
  type ResolvedPageWidth,
  resolvePageWidth,
} from './page.ts'
export {
  CUSTOM_PAPER_MAX_MM,
  CUSTOM_PAPER_MIN_MM,
  FOLD_DASH_OFF_MM,
  FOLD_DASH_ON_MM,
  fromMillimeters,
  MARK_GAP_MM,
  MARK_LENGTH_MM,
  type MarkSegment,
  MM_PER_PT,
  NAMED_PAPERS,
  type NamedPaper,
  type NamedPaperMetadata,
  ORIENTATIONS,
  Orientation,
  PAPER_GROUPS,
  PAPER_METADATA,
  PAPER_MM,
  PAPER_UNITS,
  Paper,
  type PaperBox,
  type PaperGroup,
  PaperSize,
  PaperUnit,
  PrintSetting,
  PrintSettingInput,
  PX_PER_MM,
  PX_PER_PT,
  paperPixels,
  printBoxes,
  printPadding,
  printProperties,
  roundMillimeters,
  sheetMm,
  toMillimeters,
} from './paper.ts'
export { paperViewport, usesPressLayout } from './paper-viewport.ts'
export {
  AssetKind,
  CropEdge,
  PLACEMENT_ACCEPTS,
  Placement,
  type PlacementContainer,
  PlacementCrop,
  type PlacementInput,
} from './placement.ts'
export { checkPlacementCycles, findPlacementCycle, type PlacementGraph } from './placement-cycle.ts'
export { PlacementRefusedError } from './placement-refusal.ts'
export { MarkColor, Print, type PrintInput } from './print.ts'
export { isPrintedPageIdentityImposition } from './printed-page-imposition.ts'
export * from './printed-pages.ts'
export { Scripts } from './scripts.ts'
export { type ShotUse, shotsUsed } from './shots-used.ts'
export * from './slots.ts'
export { MAX_SLIDE_TIMING_MS } from './timing.ts'
export * from './transition.ts'
