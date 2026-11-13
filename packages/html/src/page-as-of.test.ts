import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePrintedPageHtml } from './markdown.ts'
import { fillPageAsOfBindings } from './page-as-of.ts'

test('fills the day throughout a printed page and leaves host bindings untouched', () => {
  const page = resolvePrintedPageHtml(
    Page.parse({
      print: { paper: 'letter' },
      printedPages: {
        sections: [{ id: 'body', html: '<p data-slot-value="asOf.date">section</p><b data-slot-value="person.name">Person</b>' }],
        parents: [
          {
            name: 'body',
            regions: {
              head: { edge: 'blockStart', html: '<header data-slot-value="asOf.date">head</header><b data-slot-value="person.name">Person</b>' },
              foot: { edge: 'blockEnd', html: '<footer data-slot-value="asOf.date">foot</footer><b data-slot-value="person.name">Person</b>' },
            },
          },
        ],
        parentRules: [{ parent: 'body' }],
      },
    }),
  )

  const filled = fillPageAsOfBindings(page, { date: '2026-11-14', zone: 'UTC', kind: 'current' })
  const section = filled.printedPages.sections[0]
  if (!section || 'pages' in section) throw new Error('the fixture did not produce a flowing section')
  const parts = [section.html, filled.printedPages.parents[0]?.regions.head?.html, filled.printedPages.parents[0]?.regions.foot?.html]
  for (const part of parts) {
    expect(part).toContain('2026-11-14')
    expect(part).toContain('data-slot-value="person.name">Person</b>')
  }
})
