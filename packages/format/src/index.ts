// The shapes every package agrees on. Hosts read and write these as JSON, so
// each is a Zod schema and the JSON Schema is generated from it (`jsonSchemas`)
// for hosts that do not run TypeScript.

import { z } from 'zod'
import { Board } from './board.ts'
import { BookShape, BookView } from './book.ts'
import { DeckShape, Manifest, PublishedShot, Size } from './deck.ts'
import { Direction } from './direction.ts'
import { FOLD_KINDS, refineFold, resolveImposition } from './fold.ts'
import { Lexicon } from './lexicon.ts'
import { Orientation, Paper, PaperUnit, PrintSetting, PrintSettingInput, roundMillimeters, sheetMm, toMillimeters } from './paper.ts'
import { Scripts } from './scripts.ts'
import { SlotDeclaration, SlotDeclarationInput, Slots } from './slots.ts'

export { Board, type BoardInput, BoardItem, BoardLabel, BoardSection, GridCell } from './board.ts'
export {
  addItem,
  type BoardItemAnchor,
  MIN_BOARD_ITEM_WIDTH,
  moveItems,
  moveSection,
  removeItems,
  resizeItem,
} from './board-edit.ts'
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
  Book,
  BookContents,
  BookFrontMatterEntry,
  type BookInput,
  BookMode,
  BookPage,
  BookSection,
  BookView,
  type BookViewInput,
  Chapter,
  isBookContents,
  isHebrew,
  noteMarkerIssues,
} from './book.ts'
export {
  Annotation,
  annotationCueIssues,
  Box,
  Cue,
  DECK_SIZE,
  Deck,
  type DeckInput,
  type DeckLimits,
  exceedsLimits,
  ImageFit,
  Manifest,
  Narration,
  PLAYBACK_MODES,
  Playback,
  type PlaybackMode,
  Point,
  PublishedShot,
  parsePlayback,
  SHOT_KEY,
  Shot,
  Size,
  Slide,
  SlideContent,
  Word,
} from './deck.ts'
export { type DeckFromSlidesOptions, deckFromSlides, type SlideRow } from './deck-from-slides.ts'
export { Direction, firstStrongDirection, languageDirection, resolveDirection, TextDirection } from './direction.ts'
export { FOLD_KINDS, FOLD_TUCK_IN_MM, FOLD_WIDTH_TOLERANCE_MM, type FoldKind, foldCellPages, foldColumns, foldPageCountMessage, foldPanelMap } from './fold.ts'
export {
  fitPage,
  type Imposed,
  impose,
  type MillimeterEdges,
  mirrorPlacement,
  type PageFit,
  type PagePlacementKind,
  type PagePlacementLayout,
  type Placement,
  pagePlacementLayout,
} from './imposition.ts'
export {
  type ImpositionMarkEdge,
  type ImpositionSideMarks,
  impositionMarks,
  MIN_MARK_LENGTH_MM,
  type OmittedImpositionMark,
} from './imposition-marks.ts'
export { Lexicon, lexiconVersion, PronunciationEntry } from './lexicon.ts'
export * from './numbering.ts'
export {
  CUSTOM_PAPER_MAX_MM,
  CUSTOM_PAPER_MIN_MM,
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
  PaperUnit,
  PrintSetting,
  PrintSettingInput,
  PX_PER_MM,
  paperPixels,
  printBoxes,
  printPadding,
  printProperties,
  roundMillimeters,
  sheetMm,
  toMillimeters,
} from './paper.ts'
export { Scripts } from './scripts.ts'
export { type ShotUse, shotsUsed } from './shots-used.ts'
export { MAX_SLIDE_TIMING_MS } from './timing.ts'
export * from './transition.ts'

export const Margin = z.object({
  top: z.number().nonnegative().default(0),
  right: z.number().nonnegative().default(0),
  bottom: z.number().nonnegative().default(0),
  left: z.number().nonnegative().default(0),
})

// Paper exists only to export a page at a standard printed size. A page
// without it exports at its own size. Margins are in millimeters.
export const Print = z
  .object({
    paper: Paper,
    orientation: Orientation.default('portrait'),
    margin: Margin.optional(),
    bleed: z.number().nonnegative().default(0),
    safe: z.number().nonnegative().default(0),
    marks: z.boolean().default(false),
  })
  .superRefine((print, ctx) => {
    const trim = sheetMm(print)
    if (print.safe * 2 >= trim.width) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${print.safe}mm on the left and right, but the trim is ${trim.width}mm wide; safe must leave area inside the trim`,
      })
    }
    if (print.safe * 2 >= trim.height) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${print.safe}mm on the top and bottom, but the trim is ${trim.height}mm high; safe must leave area inside the trim`,
      })
    }
  })
export type Print = z.infer<typeof Print>
export type PrintInput = z.input<typeof Print>

const ImpositionGap = z.object({
  column: z.number().nonnegative().default(0),
  row: z.number().nonnegative().default(0),
})

export const MAX_IMPOSITION_CELLS = 10_000

export const Imposition = z
  .object({
    paper: Paper,
    orientation: Orientation.default('portrait'),
    unit: PaperUnit.default('mm'),
    margin: Margin.default({ top: 0, right: 0, bottom: 0, left: 0 }),
    columns: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    cell: z.object({ width: z.number().positive().optional(), height: z.number().positive() }),
    gap: ImpositionGap.default({ column: 0, row: 0 }),
    bleed: z.number().nonnegative().default(0),
    safe: z.number().nonnegative().default(0),
    fit: z.enum(['contain', 'cover']).default('contain'),
    fill: z.enum(['sequence', 'repeat']).default('sequence'),
    sides: z.enum(['one', 'two']).optional(),
    flip: z.enum(['long', 'short']).default('long'),
    skip: z.number().int().nonnegative().default(0),
    dir: z.enum(['ltr', 'rtl']).default('ltr'),
    marks: z.boolean().default(false),
    cornerMarks: z.boolean().default(false),
    fold: z.enum(FOLD_KINDS).optional(),
    panels: z.array(z.number().positive()).optional(),
  })
  .superRefine((imposition, ctx) => {
    if (imposition.cornerMarks && !imposition.marks) {
      ctx.addIssue({ code: 'custom', path: ['cornerMarks'], message: 'cornerMarks requires marks to be true' })
    }
    if (imposition.fold) {
      refineFold(imposition, ctx)
      return
    }
    if (imposition.columns === undefined) {
      ctx.addIssue({ code: 'custom', path: ['columns'], message: 'columns is required; give a column count to clear this refusal' })
    }
    if (imposition.rows === undefined) {
      ctx.addIssue({ code: 'custom', path: ['rows'], message: 'rows is required; give a row count to clear this refusal' })
    }
    if (imposition.cell.width === undefined) {
      ctx.addIssue({ code: 'custom', path: ['cell', 'width'], message: 'cell.width is required; give a cell width to clear this refusal' })
    }
    if (imposition.columns === undefined || imposition.rows === undefined || imposition.cell.width === undefined) return
    const cellCount = BigInt(imposition.columns) * BigInt(imposition.rows)
    if (imposition.columns > MAX_IMPOSITION_CELLS || imposition.rows > MAX_IMPOSITION_CELLS || cellCount > BigInt(MAX_IMPOSITION_CELLS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: `the grid has ${cellCount} cells and the ceiling is ${MAX_IMPOSITION_CELLS}; fewer columns or rows clears this refusal`,
      })
      return
    }
    const mm = (value: number) => toMillimeters(value, imposition.unit)
    const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
    const gridWidth = mm(
      imposition.margin.left + imposition.columns * imposition.cell.width + (imposition.columns - 1) * imposition.gap.column + imposition.margin.right,
    )
    const gridHeight = mm(
      imposition.margin.top + imposition.rows * imposition.cell.height + (imposition.rows - 1) * imposition.gap.row + imposition.margin.bottom,
    )
    if (gridWidth - paper.width > 0.01) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: `the grid is ${roundMillimeters(gridWidth)}mm wide and the paper is ${paper.width}mm wide, an overflow of ${roundMillimeters(gridWidth - paper.width)}mm; reduce the horizontal margins, columns, cell width or column gap`,
      })
    }
    if (gridHeight - paper.height > 0.01) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows'],
        message: `the grid is ${roundMillimeters(gridHeight)}mm high and the paper is ${paper.height}mm high, an overflow of ${roundMillimeters(gridHeight - paper.height)}mm; reduce the vertical margins, rows, cell height or row gap`,
      })
    }
    const safe = mm(imposition.safe)
    const cellWidth = mm(imposition.cell.width)
    const cellHeight = mm(imposition.cell.height)
    if (safe * 2 >= cellWidth) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${roundMillimeters(safe)}mm on the left and right, but the cell is ${roundMillimeters(cellWidth)}mm wide; safe must leave area inside the cell`,
      })
    }
    if (safe * 2 >= cellHeight) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${roundMillimeters(safe)}mm on the top and bottom, but the cell is ${roundMillimeters(cellHeight)}mm high; safe must leave area inside the cell`,
      })
    }
    const cells = imposition.columns * imposition.rows
    if (imposition.skip >= cells) {
      ctx.addIssue({ code: 'custom', path: ['skip'], message: `skip is ${imposition.skip}, but the grid has ${cells} cells; skip must be less than ${cells}` })
    }
  })
  .transform(resolveImposition)
export type Imposition = z.infer<typeof Imposition>
export type ImpositionInput = z.input<typeof Imposition>

// A page is designed for the screen at whatever size it needs: fluid (the
// viewer's width, as tall as its content), a fixed sheet, or a fixed width
// that grows with its content.
export const PageSize = z.union([z.literal('fluid'), Size, z.object({ width: z.number().int().positive(), height: z.literal('auto') })])
export type PageSize = z.infer<typeof PageSize>

export const Page = z.object({
  id: z.string().optional(),
  html: z.string(),
  size: PageSize.default('fluid'),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  print: Print.optional(),
  slots: Slots.optional(),
})
export type Page = z.infer<typeof Page>
export type PageInput = z.input<typeof Page>

export function jsonSchemas() {
  return {
    book: z.toJSONSchema(BookShape, { io: 'input' }),
    bookView: z.toJSONSchema(BookView, { io: 'input' }),
    page: z.toJSONSchema(Page, { io: 'input' }),
    lexicon: z.toJSONSchema(Lexicon, { io: 'input' }),
    imposition: z.toJSONSchema(Imposition, { io: 'input' }),
    deck: z.toJSONSchema(DeckShape, { io: 'input' }),
    manifest: z.toJSONSchema(Manifest, { io: 'input' }),
    publishedShot: z.toJSONSchema(PublishedShot, { io: 'input' }),
    board: z.toJSONSchema(Board, { io: 'input' }),
    printSetting: z.toJSONSchema(PrintSetting, { io: 'input' }),
    printSettingInput: z.toJSONSchema(PrintSettingInput, { io: 'input' }),
    slotDeclaration: z.toJSONSchema(SlotDeclaration, { io: 'input' }),
    slotDeclarationInput: z.toJSONSchema(SlotDeclarationInput, { io: 'input' }),
  }
}

export * from './slots.ts'
