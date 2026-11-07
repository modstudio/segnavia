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
  expect(internalPageLoad).toBe(Symbol.for('@segnavia/frame/internal-page-load'))
  expect(internalThumbnailDeckLoad).toBe(Symbol.for('@segnavia/frame/internal-thumbnail-deck-load'))
  expect(internalThumbnailPageLoad).toBe(Symbol.for('@segnavia/frame/internal-thumbnail-page-load'))
  expect(internalDocumentPagesLoad).toBe(Symbol.for('@segnavia/frame/internal-document-pages-load'))
  expect(internalDocumentPagesRead).toBe(Symbol.for('@segnavia/frame/internal-document-pages-read'))
  expect(internalPaperPagesLoad).toBe(Symbol.for('@segnavia/frame/internal-paper-pages-load'))
})
