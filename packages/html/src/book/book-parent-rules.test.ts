import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const chapter = (title: string) => ({ title, html: '<p>Text</p>' })
const sectionOpen = (html: string, id: string) => html.match(new RegExp(`<section[^>]*id="${id}"(?:\\s[^>]*)?>`))?.[0] ?? ''
const input = (overrides: Record<string, unknown>) => ({ title: 'Book', mode: 'continuous', chapters: [chapter('One')], ...overrides })

test('print blanks do not invent a built-in rule attribute', () => {
  const result = bookDocument(parseBookFixture(input({ chapters: [chapter('One'), chapter('Two')] })), { blankBefore: ['section-2'] }).html
  expect(result).toContain(
    '</section><div class="segnavia-blank" aria-hidden="true"></div><section class="segnavia-section segnavia-chapter" id="section-2" data-segnavia-chapter="2">',
  )
  for (const css of ['@media print', ':where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}']) expect(result).toContain(css)
  for (const attribute of ['data-segnavia-flow', 'data-segnavia-position', 'data-segnavia-parent-rules']) expect(result).not.toContain(attribute)
})

test('book parentRules reach contents and part flows', () => {
  const rules = [{ parent: 'segnavia:verso' }]
  const book = parseBookFixture(
    input({
      parentRules: rules,
      frontMatter: [{ id: 'contents', kind: 'contents', title: 'Contents' }],
      body: [{ id: 'part', name: 'part', title: 'Part', html: '<p>Opening</p>', children: [chapter('One')] }],
      chapters: undefined,
    }),
  )
  const html = bookDocument(book).html
  expect(sectionOpen(html, 'contents')).toContain('data-segnavia-parent-rules="[{&quot;parent&quot;:&quot;segnavia:verso&quot;}]"')
  expect(sectionOpen(html, 'part')).toContain('data-segnavia-parent-rules="[{&quot;parent&quot;:&quot;segnavia:verso&quot;}]"')
})

test('templated flow rules preserve section then template then book precedence', () => {
  const templateRules = [{ parent: 'segnavia:verso' }]
  const sectionRules = [{ parent: 'segnavia:recto' }]
  const base = {
    mode: 'paginated',
    page: { paper: 'a5' as const, margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    parentRules: [{ parent: 'segnavia:opener' }],
    templates: [{ name: 'page', html: '<main data-region="body"></main>', parentRules: templateRules }],
    chapters: undefined,
  }
  const withoutSection = bookDocument(
    parseBookFixture(input({ ...base, body: [{ kind: 'templated', template: 'page', pages: [{ regions: { body: '<p>Text</p>' } }] }] })),
  ).html
  expect(sectionOpen(withoutSection, 'section-1')).not.toContain('data-segnavia-parent-rules')
  expect(withoutSection).toContain('data-segnavia-template="page" hidden data-segnavia-parent-rules="[{&quot;parent&quot;:&quot;segnavia:verso&quot;}]"')

  const withSection = bookDocument(
    parseBookFixture(
      input({ ...base, body: [{ kind: 'templated', template: 'page', parentRules: sectionRules, pages: [{ regions: { body: '<p>Text</p>' } }] }] }),
    ),
  ).html
  expect(sectionOpen(withSection, 'section-1')).toContain('data-segnavia-parent-rules="[{&quot;parent&quot;:&quot;segnavia:recto&quot;}]"')
})
