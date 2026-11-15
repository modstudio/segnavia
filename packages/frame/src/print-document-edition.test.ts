import { expect, test } from 'bun:test'
import { Imposition } from '@segnavia/format'
import { printablePages } from './print-document.ts'

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
