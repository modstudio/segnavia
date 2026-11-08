import { BoardCommand } from './board-commands.ts'
import { BookView } from './book.ts'
import { Cover } from './cover.ts'
import { Manifest, PublishedShot } from './deck.ts'
import { Document } from './document.ts'
import { DocumentMetadata } from './document-metadata.ts'
import { DocumentBatch, DocumentOp } from './document-op.ts'
import { FontReference, FontReferenceInput, LocalFacesTransport, LocalFaceTransport } from './fonts.ts'
import { Imposition } from './imposition-schema.ts'
import { Lexicon } from './lexicon.ts'
import { Media } from './media.ts'
import { Motif, MotifInput } from './motif.ts'
import { PrintSetting, PrintSettingInput } from './paper.ts'
import { PlacementShape } from './placement.ts'
import { SlotDeclaration, SlotDeclarationInput } from './slots.ts'

export const EXPORTED_SCHEMAS = {
  bookView: BookView,
  document: Document,
  documentOp: DocumentOp,
  documentBatch: DocumentBatch,
  documentMetadata: DocumentMetadata,
  lexicon: Lexicon,
  imposition: Imposition,
  manifest: Manifest,
  publishedShot: PublishedShot,
  boardCommand: BoardCommand,
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
