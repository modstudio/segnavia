// The shapes every package agrees on. Hosts read and write these as JSON, so each is a Zod schema;
// `jsonSchemas` generates JSON Schema for hosts that do not run TypeScript.
export { AsOf, type AsOfDay, CalendarDate, Zone } from './as-of.ts'
export {
  type AsOfFacts,
  AsOfRefusedError,
  type AsOfResolution,
  asOfRefusal,
  calendarDate,
  resolveAsOfDay,
} from './as-of-policy.ts'
export * from './board-exports.ts'
export * from './book-exports.ts'
export { type BrandSource, resolveBrand } from './brand.ts'
export { boundComposeProgress, COMPOSE_PROGRESS_PAGES_LIMIT, type ComposeProgress } from './compose-progress.ts'
export {
  COVER_DRAWING_VERSION,
  COVER_SHEET,
  Cover,
  type CoverDigestMaterial,
  type CoverDigestOptions,
  type CoverInput,
  coverDigest,
  coverDigestMaterial,
  digestCoverMaterial,
} from './cover.ts'
export {
  Annotation,
  annotationCueIssues,
  Box,
  Cue,
  DECK_SIZE,
  Deck,
  deckLimitsExceeded,
  deckTrim,
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
export { type DesignTokens, exportDesignTokens, importDesignTokens } from './design-tokens.ts'
export {
  Direction,
  entryDirection,
  firstStrongDirection,
  htmlTextSample,
  languageDirection,
  resolveDirection,
  TextDirection,
  textDirection,
} from './direction.ts'
export { Document, type DocumentInput, type DocumentKind, type DocumentParseOptions } from './document.ts'
export { applyOps } from './document-apply.ts'
export { type AnchorSource, type DocumentDayOptions, resolveDocumentDay, resolveDocumentDayResult } from './document-day.ts'
export { diffDocuments } from './document-diff.ts'
export { fingerprintDocument, fingerprintScript, fingerprintValue, requireParsedDocument } from './document-fingerprint.ts'
export { defaultNewId } from './document-identity.ts'
export { inverseBatch, invertOps } from './document-invert.ts'
export {
  boardFromDocument,
  bookFromDocument,
  deckFromDocument,
  documentFromBoard,
  PAGE_OR_PRINTED_KINDS,
  type PageOrPrintedInput,
  pageFromDocument,
  pageOrPrintedFromDocument,
  printedFromDocument,
} from './document-lowering.ts'
export * from './document-metadata.ts'
export { DocumentNodeInput } from './document-node-input.ts'
export { HeadTemplateNode, VariableNode } from './document-nodes-book.ts'
export { DocumentBatch, DocumentCollection, DocumentLocation, DocumentOp } from './document-op.ts'
export {
  DOCUMENT_NODE_MODEL,
  type DocumentEntry,
  type DocumentNodeType,
  documentEntries,
  type OperationDocument,
  type OperationNode,
} from './document-op-model.ts'
export { type RebaseResult, rebaseOps } from './document-rebase.ts'
export { editBoard } from './edit-board.ts'
export { EXPORTED_SCHEMAS } from './exported-schema-manifest.ts'
export { FOLD_KINDS, FOLD_TUCK_IN_MM, type FoldKind, foldCellPages, foldColumns, foldPageCountMessage, foldPanelMap } from './fold.ts'
export {
  computeFolios,
  type Folio,
  folioScript,
  type NumberedPage,
  Numbering,
  SectionNumbering,
  sequenceFolios,
} from './folio.ts'
export { collectionFaces, type ExtractedFontFace, extractFace } from './font-collection.ts'
export { type ResolvedFontFace, resolveFontFace } from './font-face.ts'
export { FontFaceRefusedError } from './font-refusal.ts'
export { COLLECTION_TAG, classifyFont } from './font-signature.ts'
export {
  APP_FONT_NAME,
  APP_FONT_NAME_MESSAGE,
  type AppFont,
  AppFontDeclaration,
  FONT_FORMATS,
  FONT_GENERICS,
  FontDeclaration,
  type FontFace,
  type FontFailure,
  type FontFormat,
  type FontGeneric,
  FontManifest,
  FontManifestEntry,
  FontReference,
  FontReferenceInput,
  type FontReferencesSource,
  type FontSource,
  type FontWeightRange,
  fontManifestReferences,
  fontManifestWithReferences,
  fontWeightRange,
  fontWeightRangeCovers,
  HEBREW_UNICODE_RANGE,
  type LocalFacesInput,
  LocalFacesTransport,
  LocalFaceTransport,
  type LocalFontDeclaration,
  localFontReferences,
  matchFaces,
  persistedFontManifestWithReferences,
  rangeSample,
} from './fonts.ts'
export { HeadTemplate, HeadTemplatePart, LIBRARY_HEAD_TEMPLATES } from './head-template.ts'
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
  type PiecePress,
  pagePlacementLayout,
  sharedImpositionPress,
} from './imposition.ts'
export { type ImpositionSideBoxes, impositionBoxes } from './imposition-boxes.ts'
export { PAPER_FIT_TOLERANCE_MM } from './imposition-fit.ts'
export { mixedImpositionGeometryRefusal } from './imposition-geometry-policy.ts'
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
export { withLibraryEntries } from './library-names.ts'
export * from './limit-exports.ts'
export { LogicalMargin, type PageSide, PhysicalMargin, physicalMargins } from './margins.ts'
export * from './measurements.ts'
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
  type AssetRefusal,
  type AssetRefusalReason,
  approvedOrigins,
  approvedSources,
  assetRefusalText,
  authoredOrigin,
  DEFAULT_ORIGINS,
  FETCH_KINDS,
  type FetchKind,
  type OriginApproval,
  type OriginDecision,
  originDecision,
  originSet,
} from './origin-policy.ts'
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
export { pageDirection } from './page-direction.ts'
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
  type PrintBoxes,
  PrintSetting,
  PrintSettingInput,
  PX_PER_MM,
  PX_PER_PT,
  paperPixels,
  pressBoxes,
  printBoxes,
  printPadding,
  printProperties,
  roundMillimeters,
  sheetMm,
  toMillimeters,
} from './paper.ts'
export { paperViewport, usesPressLayout } from './paper-viewport.ts'
export * from './parent-regions.ts'
export * from './parent-rules.ts'
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
export { PaginatePageNote, PaginateWindow, PLAN_VERSION, Plan, PlanPage, type PlanParseOptions } from './plan.ts'
export * from './preflight.ts'
export {
  MarkColor,
  PRESS_GEOMETRY_FIELDS,
  PressGeometry,
  type PressGeometryField,
  type PressGeometryInput,
  Print,
  type PrintInput,
  pressSafeAreaIssues,
} from './print.ts'
export { isPrintedPageIdentityImposition } from './printed-page-imposition.ts'
export * from './printed-pages.ts'
export { RecordFacts, RecordValues } from './record-facts.ts'
export { Scripts } from './scripts.ts'
export { type ShotUse, shotsUsed } from './shots-used.ts'
export * from './slot-values.ts'
export * from './slots.ts'
export {
  type MergedStyleSheet,
  type MergeStyleSheetsResult,
  mergeStyleSheets,
  type OriginEntry,
  type StyleOrigin,
} from './style-merge.ts'
export {
  Brand,
  Dimension,
  HexColor,
  KEEP_WITH_CUSTOM_PROPERTY,
  PageGeometry,
  STYLE_NAME,
  StyleSheet,
  TEXT_STYLE_PROPERTIES,
  TextStyle,
  type TextStyleKind,
  type TextStyleTokenGroup,
  TokenReference,
} from './style-sheet.ts'
export { MAX_SLIDE_TIMING_MS } from './timing.ts'
export * from './transition.ts'
export { LIBRARY_VARIABLES, MetaVariable, NumberVariable, RecordVariable, TextVariable, Variable } from './variable.ts'
export {
  bookVariableDocumentFacts,
  STANDARD_META_FIELD_READERS,
  type StandardMetaField,
  VariableDocumentFacts,
  variableReadsDocumentFacts,
} from './variable-document-facts.ts'
export { metaVariableValue, textVariableValue, type VariablePageFacts, variableValue } from './variable-value.ts'
