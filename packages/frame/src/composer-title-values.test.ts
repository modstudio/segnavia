import { expect, test } from 'bun:test'
import { bookDocument, parseBookFixture } from '@segnavia/html'
import { parsePartValues, partTitleValues, sectionTitleValues } from './composer-title-values.ts'

test('resolves a top-level chapter number once from its section attribute', () => {
  const variables = [
    { name: 'chapter', kind: 'text' as const, from: 'chapter-number' as const, pick: 'first' as const },
    { name: 'part', kind: 'text' as const, from: 'part-number' as const, part: 'gate', pick: 'first' as const },
  ]
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    numbering: { chapters: {} },
    chapters: [{ title: 'Chapter', html: '<p>Text</p>' }],
  })
  const built = bookDocument(book, { build: 'galley' })
  expect(built.html).toContain('data-segnavia-section-number="1"')
  expect(built.html).not.toContain('#chapter')
  expect(partTitleValues(variables, { '#gate': 'II' })).toEqual([{ name: 'part', value: 'II', line: 0, scope: 'flow' }])
  expect(
    sectionTitleValues(
      variables,
      [{ getAttribute: (name) => (name === 'data-segnavia-section-number' ? '1' : null), getBoundingClientRect: () => ({ top: 0 }) }],
      [],
      0,
      () => 0,
    ),
  ).toEqual([
    { name: 'chapter', value: '1', line: 0, scope: 'flow' },
    { name: 'part', value: '', line: 0, scope: 'flow' },
  ])
})

test('treats malformed and inherited part values as absent', () => {
  expect(parsePartValues('{')).toEqual({})
  expect(
    sectionTitleValues(
      [{ name: 'part', kind: 'text', from: 'part-title', part: 'constructor', pick: 'first' }],
      [{ getAttribute: (name) => (name === 'data-segnavia-parts' ? '{}' : null), getBoundingClientRect: () => ({ top: 0 }) }],
      [],
      0,
      () => 0,
    ),
  ).toEqual([{ name: 'part', value: '', line: 0, scope: 'flow' }])
})

test('leaves chapter-number empty while resolving part-number on a part opening', () => {
  expect(
    sectionTitleValues(
      [
        { name: 'chapter', kind: 'text', from: 'chapter-number', pick: 'first' },
        { name: 'part', kind: 'text', from: 'part-number', part: 'gate', pick: 'first' },
      ],
      [
        {
          getAttribute: (name) => (name === 'data-segnavia-parts' ? '{"#gate":"II"}' : null),
          getBoundingClientRect: () => ({ top: 0 }),
        },
      ],
      [],
      0,
      () => 0,
    ),
  ).toEqual([
    { name: 'chapter', value: '', line: 0, scope: 'flow' },
    { name: 'part', value: 'II', line: 0, scope: 'flow' },
  ])
})
