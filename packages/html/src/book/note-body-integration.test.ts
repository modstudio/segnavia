import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const chapter = (title: string, html: string) => ({ title, html })
const input = (overrides: Record<string, unknown> = {}) => ({
  title: 'Book',
  mode: 'continuous',
  chapters: [chapter('One', '<p>Text</p>')],
  ...overrides,
})

test('preserves authored block note bodies and puts the marker at the first running text', () => {
  const notes = [
    '<span data-note="endnote"><p>First</p><p>Second</p></span>',
    '<span data-note="endnote"><blockquote><p>Quoted</p></blockquote></span>',
    '<span data-note="endnote"><ul><li>Listed</li></ul></span>',
  ].join('')
  const result = bookDocument(parseBookFixture(input({ chapters: [chapter('One', `<p>Text${notes}</p>`)] }))).html
  expect(result).toMatch(
    /<div class="segnavia-endnote" id="segnavia-en-1"><p[^>]*><a href="#segnavia-enref-1"><bdi>1<\/bdi><\/a> First<\/p><p[^>]*>Second<\/p><\/div>/,
  )
  expect(result).toMatch(
    /<div class="segnavia-endnote" id="segnavia-en-2"><blockquote><p[^>]*><a href="#segnavia-enref-2"><bdi>2<\/bdi><\/a> Quoted<\/p><\/blockquote><\/div>/,
  )
  expect(result).toMatch(
    /<div class="segnavia-endnote" id="segnavia-en-3"><a href="#segnavia-enref-3"><bdi>3<\/bdi><\/a> <ul><li[^>]*>Listed<\/li><\/ul><\/div>/,
  )
  expect(result).not.toMatch(/<p class="segnavia-endnote"[^>]*>[\s\S]*<(?:p|blockquote|ul)>/)
})

test('keeps block footnote bodies in both flowing and galley builds', () => {
  const book = parseBookFixture(
    input({
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [chapter('One', '<p>Text<span data-note="footnote"><p>First</p><p>Second</p></span></p>')],
    }),
  )
  const flow = bookDocument(book, { build: 'flow' }).html
  const galley = bookDocument(book, { build: 'galley' }).html
  const body =
    /<div class="segnavia-footnote" id="segnavia-fn-1-1"><p[^>]*><a href="#segnavia-fnref-1-1"><bdi>\*<\/bdi><\/a> First<\/p><p[^>]*>Second<\/p><\/div>/
  expect(flow).toMatch(body)
  expect(flow).toMatch(/<div class="segnavia-footnotes"[^>]*><div class="segnavia-footnote"/)
  expect(galley).toMatch(body)
  expect(galley).toMatch(/data-segnavia-note="segnavia-fn-1-1"[^>]*><div class="segnavia-footnote"/)
})

test('keeps a Hebrew block note marker isolated and its paragraphs authored', () => {
  const result = bookDocument(
    parseBookFixture(
      input({
        lang: 'he',
        chapters: [chapter('א', '<p>טקסט<span data-note="endnote"><p dir="rtl" lang="he">ראשון</p><p dir="rtl" lang="he">שני</p></span></p>')],
      }),
    ),
  ).html
  expect(result).toMatch(
    /<div class="segnavia-endnote" id="segnavia-en-1"><p dir="rtl" lang="he"[^>]*><a href="#segnavia-enref-1"><bdi>1<\/bdi><\/a> ראשון<\/p><p dir="rtl" lang="he"[^>]*>שני<\/p><\/div>/,
  )
})
