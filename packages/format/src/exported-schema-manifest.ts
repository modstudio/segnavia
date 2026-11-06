import { Board } from './board.ts'
import { BoardCommand } from './board-commands.ts'
import { BoardOp } from './board-ops.ts'
import { BookShape, BookView } from './book.ts'
import { Cover } from './cover.ts'
import { DeckShape, Manifest, PublishedShot } from './deck.ts'
import { Document } from './document.ts'
import { DocumentMetadata } from './document-metadata.ts'
import { FontReference, FontReferenceInput, LocalFacesTransport, LocalFaceTransport } from './fonts.ts'
import { Imposition } from './imposition-schema.ts'
import { Lexicon } from './lexicon.ts'
import { Media } from './media.ts'
import { Motif, MotifInput } from './motif.ts'
import { Page } from './page.ts'
import { PrintSetting, PrintSettingInput } from './paper.ts'
import { PlacementShape } from './placement.ts'
import { SlotDeclaration, SlotDeclarationInput } from './slots.ts'

export const EXPORTED_SCHEMAS = {
  book: BookShape,
  bookView: BookView,
  document: Document,
  documentMetadata: DocumentMetadata,
  page: Page,
  lexicon: Lexicon,
  imposition: Imposition,
  deck: DeckShape,
  manifest: Manifest,
  publishedShot: PublishedShot,
  board: Board,
  boardCommand: BoardCommand,
  boardOp: BoardOp,
  printSetting: PrintSetting,
  printSettingInput: PrintSettingInput,
  slotDeclaration: SlotDeclaration,
  slotDeclarationInput: SlotDeclarationInput,
  fontReference: FontReference,
  fontReferenceInput: FontReferenceInput,
  localFaceTransport: LocalFaceTransport,
  localFacesTransport: LocalFacesTransport,
  motif: Motif,
  motifInput: MotifInput,
  media: Media,
  placement: PlacementShape,
  cover: Cover,
} as const
