import { z } from 'zod'
import { Board } from './board.ts'
import { BoardCommand } from './board-commands.ts'
import { BoardOp } from './board-ops.ts'
import { BookShape, BookView } from './book.ts'
import { Cover } from './cover.ts'
import { DeckShape, Manifest, PublishedShot } from './deck.ts'
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

export function jsonSchemas() {
  return {
    book: z.toJSONSchema(BookShape, { io: 'input' }),
    bookView: z.toJSONSchema(BookView, { io: 'input' }),
    documentMetadata: z.toJSONSchema(DocumentMetadata, { io: 'input' }),
    page: z.toJSONSchema(Page, { io: 'input' }),
    lexicon: z.toJSONSchema(Lexicon, { io: 'input' }),
    imposition: z.toJSONSchema(Imposition, { io: 'input' }),
    deck: z.toJSONSchema(DeckShape, { io: 'input' }),
    manifest: z.toJSONSchema(Manifest, { io: 'input' }),
    publishedShot: z.toJSONSchema(PublishedShot, { io: 'input' }),
    board: z.toJSONSchema(Board, { io: 'input' }),
    boardCommand: z.toJSONSchema(BoardCommand, { io: 'input' }),
    boardOp: z.toJSONSchema(BoardOp, { io: 'input' }),
    printSetting: z.toJSONSchema(PrintSetting, { io: 'input' }),
    printSettingInput: z.toJSONSchema(PrintSettingInput, { io: 'input' }),
    slotDeclaration: z.toJSONSchema(SlotDeclaration, { io: 'input' }),
    slotDeclarationInput: z.toJSONSchema(SlotDeclarationInput, { io: 'input' }),
    fontReference: z.toJSONSchema(FontReference, { io: 'input' }),
    fontReferenceInput: z.toJSONSchema(FontReferenceInput, { io: 'input' }),
    localFaceTransport: z.toJSONSchema(LocalFaceTransport, { io: 'input' }),
    localFacesTransport: z.toJSONSchema(LocalFacesTransport, { io: 'input' }),
    motif: z.toJSONSchema(Motif, { io: 'input' }),
    motifInput: z.toJSONSchema(MotifInput, { io: 'input' }),
    media: z.toJSONSchema(Media, { io: 'input' }),
    placement: z.toJSONSchema(PlacementShape, { io: 'input' }),
    cover: z.toJSONSchema(Cover, { io: 'input' }),
  }
}
