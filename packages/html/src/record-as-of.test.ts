import { expect, test } from 'bun:test'
import { isDesignedSection, isTemplatedSection } from '@segnavia/format'
import { parseBookFixture } from './book/book-test-fixture.ts'
import { fillBookAsOfBindings, fillBookViewAsOfBindings } from './record-as-of.ts'

test('book as-of bindings fill sections, parts, templates and parent-page furniture', () => {
  const book = parseBookFixture({
    title: 'Dated book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    templates: [{ name: 'lesson', html: '<main data-region="body"><time data-slot-value="asOf.moment"></time></main>' }],
    parentPages: [{ name: 'dated', basedOn: 'segnavia:recto', regions: { head: { edge: 'blockStart', html: '<time data-slot-value="asOf.moment"></time>' } } }],
    body: [
      { kind: 'designed', pages: [{ html: '<time data-slot-value="asOf.moment"></time>' }] },
      { kind: 'templated', template: 'lesson', pages: [{ regions: { body: '<time data-slot-value="asOf.moment"></time>' } }] },
      {
        name: 'part',
        html: '<time data-slot-value="asOf.moment"></time>',
        children: [{ title: 'One', html: '<time data-slot-value="asOf.moment"></time>' }],
      },
    ],
  })
  const filled = fillBookAsOfBindings(book, {
    date: '2026-11-14',
    zone: 'America/New_York',
    kind: 'current',
    moment: Date.parse('2026-11-14T13:00:00Z'),
  })
  const expected = '2026-11-14T08:00:00-05:00'
  const designed = filled.body[0]
  const templated = filled.body[1]
  const part = filled.body[2]

  expect(filled.templates[0]?.html).toContain(expected)
  expect(filled.parentPages[0]?.regions.head?.html).toContain(expected)
  expect(designed && isDesignedSection(designed) && designed.pages[0]?.html).toContain(expected)
  expect(templated && isTemplatedSection(templated) && templated.pages[0]?.regions.body).toContain(expected)
  expect(part && 'name' in part && part.html).toContain(expected)
  expect(part && 'name' in part && part.children[0] && 'html' in part.children[0] && part.children[0].html).toContain(expected)
})

test('book view as-of bindings fill the body, flow and parent-page regions', () => {
  const day = { date: '2026-11-14' as const, zone: 'America/New_York', kind: 'fixed' as const }
  const binding = '<time data-slot-value="asOf.date"></time>'
  const filled = fillBookViewAsOfBindings(
    {
      html: binding,
      flow: binding,
      scripts: 'refuse',
      pagination: {
        paper: { width: 100, height: 140 },
        margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
        columnGap: 0,
        geometries: [],
        direction: 'ltr',
        numbering: { frontMatter: 'roman-lower', body: 'arabic', printed: { frontMatter: true, body: true } },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [{ name: 'body', regions: { head: { edge: 'blockStart', html: binding } } }],
        endnotePlacement: 'book',
        contents: { pageNumbers: true, depth: 2 },
        variables: [],
        headTemplates: [],
      },
    },
    day,
  )
  expect(filled.html).toContain('2026-11-14')
  expect(filled.flow).toContain('2026-11-14')
  expect(filled.pagination?.parents[0]?.regions.head?.html).toContain('2026-11-14')
})
