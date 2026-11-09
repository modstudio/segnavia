import { expect, test } from 'bun:test'
import { parentPaperIssues } from './book-parent-geometry-policy.ts'

test('a named parent whose text area does not fit names the section, parent, paper and remedy', () => {
  expect(
    parentPaperIssues([
      { section: 'Wide', parent: 'narrow', path: ['body', 1], paper: { width: 279.4, height: 215.9 }, textArea: { width: -20.6, height: 195.9 } },
    ]),
  ).toEqual([
    {
      path: ['body', 1],
      message:
        'Section "Wide" names parent page "narrow", whose -20.6mm by 195.9mm text area does not fit on 279.4mm by 215.9mm paper; reduce the parent margins, use larger paper, or remove that parent to clear this refusal.',
    },
  ])
})
