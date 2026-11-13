import { expect, test } from 'bun:test'
import { pagesTagged, printTagged } from './pdf-tagging.ts'

test('tags books and standalone printed documents (mutation: require both facts)', () => {
  expect(printTagged({ book: true, composed: false, printedDocument: false })).toBeTrue()
  expect(printTagged({ book: false, composed: false, printedDocument: true })).toBeTrue()
})

test('leaves a plain pagePdf untagged (mutation: tag every standalone print)', () => {
  expect(pagesTagged([false], false)).toBeFalse()
})

test('tags a pagesPdf join only when every part qualifies (mutation: use some)', () => {
  expect(pagesTagged([true, true], false)).toBeTrue()
  expect(pagesTagged([true, false], false)).toBeFalse()
})

test('leaves composed imposition sheets untagged (mutation: ignore composition)', () => {
  expect(pagesTagged([true], true)).toBeFalse()
})
