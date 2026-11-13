import { describe, expect, test } from 'bun:test'
import { parse } from '../sanitize.ts'
import { bookDocument } from './book-document.ts'
import { collectHeadings } from './book-held.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const paginatedBook = (chapter: Record<string, unknown>, templates: Record<string, unknown>[] = []) =>
  parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    templates,
    chapters: [chapter],
  })

describe('collectHeadings', () => {
  test('turns every listing attribute value into independent contents and outline facts', () => {
    const document = parse(
      '<h1 data-segnavia-id="both">Both</h1><h2 data-segnavia-id="none" data-segnavia-listed="none">None</h2><h2 data-segnavia-id="outline" data-segnavia-listed="outline">Outline</h2><h2 data-segnavia-id="contents" data-segnavia-listed="contents">Contents</h2>',
    )
    expect(collectHeadings(document.children, 'section', 6, 1).map(({ id, listed }) => ({ id, listed }))).toEqual([
      { id: 'both', listed: { contents: true, outline: true } },
      { id: 'outline', listed: { contents: false, outline: true } },
      { id: 'contents', listed: { contents: true, outline: false } },
    ])
  })
  test('skips an unlisted id-less heading but refuses an id-less listed heading (mutation: require every heading id first)', () => {
    expect(collectHeadings(parse('<h3 data-segnavia-listed="none">Hidden</h3>').children, 'section', 6, 1)).toEqual([])
    expect(() => collectHeadings(parse('<h3>Listed</h3>').children, 'section', 6, 1)).toThrow('heading <h3> in section "section" has no id')
  })
  test('separates line breaks and block children in heading text', () => {
    const document = parse(
      '<h1 data-segnavia-id="heading-1">Part<br>One</h1><h1 data-segnavia-id="heading-2">חלק<br>ראשון</h1><h1 data-segnavia-id="heading-3">Before<div>Middle</div>After</h1><h1 data-segnavia-id="heading-4">Part<!--note-->One</h1><h1 data-segnavia-id="heading-5">Part<style>p{color:red}</style>One</h1><h1 data-segnavia-id="heading-6">Part<template>hidden</template>One</h1>',
    )

    expect(collectHeadings(document.children, 'section', 6, 1).map((heading) => heading.text)).toEqual([
      'Part One',
      'חלק ראשון',
      'Before Middle After',
      'PartOne',
      'PartOne',
      'PartOne',
    ])
  })
})

describe('held section contents', () => {
  test('keeps an outline-only heading out of the printed contents without dropping its heading fact', () => {
    const book = parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      frontMatter: [{ kind: 'contents', title: 'Contents' }],
      chapters: [{ title: 'One', html: '<h2 data-segnavia-id="outline-only" data-segnavia-listed="outline">Outline only</h2>' }],
    })
    const built = bookDocument(book)
    expect(built.headings.find((heading) => heading.id === 'outline-only')?.listed).toEqual({ contents: false, outline: true })
    expect(built.html).not.toContain('href="#outline-only"')
  })
  test('lists every designed-section heading only when contents is enabled', () => {
    const section = { kind: 'designed', title: 'Gallery', pages: [{ html: '<h1 id="art">Art</h1><h2 id="detail">Detail</h2>' }] }

    expect(bookDocument(paginatedBook({ ...section, contents: false })).headings).toEqual([])
    expect(bookDocument(paginatedBook({ ...section, contents: true })).headings.map(({ id, level, text }) => ({ id, level, text }))).toEqual([
      { id: 'section-1', level: 1, text: 'Gallery' },
      { id: 'art', level: 1, text: 'Art' },
      { id: 'detail', level: 2, text: 'Detail' },
    ])
  })

  test('lists every templated-section heading only when contents is enabled', () => {
    const section = {
      kind: 'templated',
      title: 'Lessons',
      template: 'lesson',
      pages: [{ regions: { heading: '<h1 id="lesson">Lesson</h1><h2 id="topic">Topic</h2>' } }],
    }
    const templates = [{ name: 'lesson', html: '<div data-region="heading"></div>' }]

    expect(bookDocument(paginatedBook({ ...section, contents: false }, templates)).headings).toEqual([])
    expect(bookDocument(paginatedBook({ ...section, contents: true }, templates)).headings.map(({ id, level, text }) => ({ id, level, text }))).toEqual([
      { id: 'section-1', level: 1, text: 'Lessons' },
      { id: 'lesson', level: 1, text: 'Lesson' },
      { id: 'topic', level: 2, text: 'Topic' },
    ])
  })

  test('lists every end-matter flowing-section heading only when contents is enabled', () => {
    const book = (contents: boolean) =>
      parseBookFixture({
        title: 'Book',
        mode: 'paginated',
        page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
        chapters: [{ title: 'One', html: '<p>Body</p>' }],
        endMatter: [{ title: 'Index', contents, html: '<h2 id="entries">Entries</h2>' }],
      })

    expect(bookDocument(book(false)).headings.map(({ text }) => text)).toEqual(['One'])
    expect(bookDocument(book(true)).headings.map(({ text }) => text)).toEqual(['One', 'Index', 'Entries'])
  })
})
