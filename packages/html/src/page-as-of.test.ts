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
            head: '<header data-slot-value="asOf.date">head</header><b data-slot-value="person.name">Person</b>',
            foot: '<footer data-slot-value="asOf.date">foot</footer><b data-slot-value="person.name">Person</b>',
          },
        ],
        parentRules: [{ parent: 'body' }],
      },
    }),
  )

  const filled = fillPageAsOfBindings(page, { date: '2026-11-14', zone: 'UTC', kind: 'current' })
  const parts = [filled.printedPages.sections[0]?.html, filled.printedPages.parents[0]?.head, filled.printedPages.parents[0]?.foot]
  for (const part of parts) {
    expect(part).toContain('2026-11-14')
    expect(part).toContain('data-slot-value="person.name">Person</b>')
  }
})
