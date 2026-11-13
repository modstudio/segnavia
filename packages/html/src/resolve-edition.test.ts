import { expect, test } from 'bun:test'
import { bookFromDocument } from '@segnavia/format'
import { bookDocument } from './book/book-document.ts'
import { parseDocument } from './document.ts'
import { documentOutlineSource } from './document-outline.ts'
import { resolveEdition } from './resolve-edition.ts'

const input = {
  type: 'document' as const,
  kind: 'book' as const,
  title: 'Worksheet',
  mode: 'continuous' as const,
  conditions: [
    { type: 'condition' as const, name: 'student' },
    { type: 'condition' as const, name: 'teacher' },
    { type: 'condition' as const, name: 'shared' },
  ],
  editions: [
    { type: 'edition' as const, name: 'student', conditions: ['student', 'shared'] },
    { type: 'edition' as const, name: 'teacher', conditions: ['teacher', 'shared'] },
  ],
  defaultEdition: 'student',
  children: [
    {
      type: 'section' as const,
      title: 'Questions',
      conditions: ['student', 'teacher'],
      children: [
        {
          type: 'flow' as const,
          html: '<h2>Visible heading</h2><p>Prompt <span data-segnavia-condition="student"> blank</span><span data-segnavia-condition="teacher"> answer</span><span data-note="footnote">visible note</span></p><div data-segnavia-condition="teacher">Key</div><p data-segnavia-condition="student teacher">Shared</p>',
        },
      ],
    },
    {
      type: 'section' as const,
      title: 'Placed answer',
      conditions: ['teacher'],
      children: [{ type: 'placed' as const, kind: 'page' as const, address: 'answer' }],
    },
    {
      type: 'section' as const,
      title: 'Teacher only',
      conditions: ['teacher'],
      children: [{ type: 'flow' as const, html: '<h2>Hidden heading</h2><p>Notes<span data-note="footnote">hidden note</span></p>' }],
    },
  ],
}

test('resolves the default edition with ANY matching and removes inline, block, node and section content', () => {
  const document = parseDocument(input, {
    newId: (() => {
      let id = 0
      return () => `id-${++id}`
    })(),
  })
  const resolved = resolveEdition(document)
  expect(resolved.children).toHaveLength(1)
  const section = resolved.children[0]
  expect(section).not.toHaveProperty('conditions')
  const children = section && 'children' in section ? section.children : []
  expect(children).toHaveLength(1)
  const flow = children?.[0]
  expect(flow?.type === 'flow' ? flow.html : '').toContain(' blank')
  expect(flow?.type === 'flow' ? flow.html : '').not.toContain(' answer')
  expect(flow?.type === 'flow' ? flow.html : '').toContain('Shared')
  expect(flow?.type === 'flow' ? flow.html : '').not.toContain('Key')
  expect(flow?.type === 'flow' ? flow.html : '').not.toContain('data-segnavia-condition')
})

test('selects a requested edition, strips markers, and refuses an unknown edition', () => {
  const document = parseDocument(input)
  const resolved = resolveEdition(document, 'teacher')
  expect(resolved.children).toHaveLength(3)
  const placed = resolved.children[1]
  expect(placed && 'children' in placed ? placed.children?.some((node) => node.type === 'placed') : false).toBeTrue()
  expect(JSON.stringify(resolved)).not.toContain('data-segnavia-condition')
  expect(JSON.stringify(resolved.children)).not.toContain('"conditions"')
  expect(() => resolveEdition(document, 'missing')).toThrow('requested edition "missing" is unknown')
})

test('returns the same document when no conditions are declared', () => {
  const document = parseDocument({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Body</p>' } }] })
  expect(resolveEdition(document)).toBe(document)
})

test('removes hidden headings from outlines and contents and hidden notes from numbering', () => {
  const resolved = resolveEdition(parseDocument(input))
  expect(documentOutlineSource(resolved).headings.map((heading) => heading.title)).not.toContain('Hidden heading')
  const built = bookDocument(bookFromDocument(resolved)).html
  expect(built).toContain('Visible heading')
  expect(built).toContain('visible note')
  expect(built).not.toContain('Hidden heading')
  expect(built).not.toContain('hidden note')
  expect(built).toContain('id="segnavia-fn-1-1"')
  expect(built).not.toContain('segnavia-fn-1-2')
})
