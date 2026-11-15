import { expect, test } from 'bun:test'
import { Imposition } from '@segnavia/format'
import { printableDeck, printablePages } from './print-document.ts'

test('printable pages lower the selected document edition', () => {
  const input = {
    type: 'document' as const,
    kind: 'page' as const,
    conditions: [{ type: 'condition' as const, name: 'teacher' }],
    editions: [
      { type: 'edition' as const, name: 'student', conditions: [] },
      { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
    ],
    defaultEdition: 'student',
    size: { width: 10, height: 10 },
    print: { paper: { width: 10, height: 10, unit: 'mm' as const }, bleed: 1, safe: 0.5 },
    children: [
      {
        type: 'page' as const,
        body: { html: '<p>Question<span data-segnavia-condition="teacher"> Answer</span></p>' },
      },
    ],
  }
  const imposition = Imposition.parse({
    paper: { width: 10, height: 10, unit: 'mm' },
    columns: 1,
    rows: 1,
    cell: { width: 10, height: 10 },
  })
  expect(printablePages([input], imposition)).not.toContain('Answer')
  expect(printablePages([input], imposition, { edition: 'teacher' })).toContain('Answer')
})

test('printable deck lowers the selected document edition', () => {
  const input = {
    type: 'document' as const,
    kind: 'deck' as const,
    title: 'Questions',
    conditions: [{ type: 'condition' as const, name: 'teacher' }],
    editions: [
      { type: 'edition' as const, name: 'student', conditions: [] },
      { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
    ],
    defaultEdition: 'student',
    children: [
      {
        type: 'slide' as const,
        id: 'question',
        content: { kind: 'html' as const, html: '<p>Question<span data-segnavia-condition="teacher"> Answer</span></p>' },
      },
    ],
  }
  expect(printableDeck(input)).not.toContain('Answer')
  expect(printableDeck(input, { edition: 'teacher' })).toContain('Answer')
})
