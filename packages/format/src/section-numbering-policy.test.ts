import { expect, test } from 'bun:test'
import { sectionNumberingIssues } from './section-numbering-policy.ts'

const section = { id: 'cover', title: 'Cover', division: 'front' as const, path: ['frontMatter', 0], numbering: { restart: 4 } }

test('refuses section numbering in continuous books with its remedy', () => {
  const issues = sectionNumberingIssues({
    mode: 'continuous',
    systems: { frontMatter: 'roman-lower', body: 'arabic' },
    sections: [section],
    printedPageRules: false,
  })
  expect(issues[0]?.message).toContain('use the paginated layout or remove numbering from section "Cover" to clear this refusal')
})

test('refuses section numbering with printed-page rules', () => {
  const issues = sectionNumberingIssues({
    mode: 'paginated',
    systems: { frontMatter: 'roman-lower', body: 'arabic' },
    sections: [section],
    printedPageRules: true,
  })
  expect(issues[0]?.message).toContain('remove section numbering or the printed-page rules to clear this refusal')
})

test('refuses restart beyond the division number system range', () => {
  const issues = sectionNumberingIssues({
    mode: 'paginated',
    systems: { frontMatter: 'roman-lower', body: 'hebrew' },
    sections: [{ ...section, division: 'body', numbering: { restart: 10_000 } }],
    printedPageRules: false,
  })
  expect(issues[0]?.message).toContain('hebrew range 1 to 9999')
})
