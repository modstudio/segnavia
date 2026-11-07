import { expect, test } from 'bun:test'
import {
  internalDocumentPagesLoad,
  internalDocumentPagesRead,
  internalPageLoad,
  internalPaperPagesLoad,
  internalThumbnailDeckLoad,
  internalThumbnailPageLoad,
} from './document-value-load.ts'

test('internal document value methods keep their identity across browser bundles', () => {
  expect(Symbol.keyFor(internalPageLoad)).toBe('@segnavia/frame/internal-page-load')
  expect(Symbol.keyFor(internalThumbnailDeckLoad)).toBe('@segnavia/frame/internal-thumbnail-deck-load')
  expect(Symbol.keyFor(internalThumbnailPageLoad)).toBe('@segnavia/frame/internal-thumbnail-page-load')
  expect(Symbol.keyFor(internalDocumentPagesLoad)).toBe('@segnavia/frame/internal-document-pages-load')
  expect(Symbol.keyFor(internalDocumentPagesRead)).toBe('@segnavia/frame/internal-document-pages-read')
  expect(Symbol.keyFor(internalPaperPagesLoad)).toBe('@segnavia/frame/internal-paper-pages-load')
})
