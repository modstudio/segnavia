import { expect, test } from 'bun:test'
import type { IdmlFindings } from './findings.ts'
import type { StoryFirstPage } from './part-runs.ts'
import { idmlPreview, idmlQuestions } from './questions.ts'

const pages = ['1', '2', '3'].map((name, index) => ({
  id: name,
  name,
  spread: `s${index}`,
  appliedMaster: index < 2 ? 'Open' : 'Body',
  stories: [`story-${name}`],
  paragraphs: [{ style: 'Heading', text: `Title ${name}` }],
}))
const findings: IdmlFindings = {
  pages,
  masters: [
    { name: 'Open', pages: ['1', '2'] },
    { name: 'Body', pages: ['3'] },
  ],
  sections: [
    { name: 'One', startPage: '1', pages: ['1'] },
    { name: 'Two', startPage: '2', pages: ['2', '3'] },
  ],
  paragraphStyles: [{ name: 'Heading', pages: pages.map((page) => ({ page: page.name, count: 1, texts: [page.paragraphs[0]?.text ?? ''] })) }],
}
const stories: StoryFirstPage[] = pages.map((page) => ({ story: page.stories[0] ?? '', page: page.name }))

test('builds sorted parts candidates with exact previews and collapses duplicate runs', () => {
  const question = idmlQuestions(findings, stories)[0]
  expect(question?.id).toBe('parts')
  expect(question?.candidates.map((candidate) => candidate.label)).toEqual([
    'Master Open; IDML sections',
    'Paragraph style Heading',
    'Choose opener pages',
    'Keep the book flat',
  ])
  expect(question?.candidates[0]?.preview.parts.map((part) => part.openerPage)).toEqual(['1', '2'])
})

test('asks titles only after a non-flat parts answer', () => {
  expect(idmlQuestions(findings, stories, { parts: { none: true } })).toEqual([])
  const question = idmlQuestions(findings, stories, { parts: { master: 'Open' } })[0]
  expect(question?.id).toBe('titles')
  expect(question?.candidates.map((candidate) => candidate.label)).toEqual([
    'Paragraph style Heading (2 of 2 parts)',
    'First paragraph on each opener',
    'Host-supplied titles',
  ])
  expect(question?.candidates[0]?.preview.untitled).toBe(0)
})

test('reports untitled opener locations and distinguishes first-paragraph titles', () => {
  const partial = {
    ...findings,
    pages: pages.map((page, index) => ({
      ...page,
      paragraphs:
        index === 0
          ? [
              { style: 'Body', text: 'Opening words' },
              { style: 'Heading', text: 'Styled title' },
            ]
          : [{ style: 'Body', text: `Body ${index}` }],
    })),
  }
  const styled = idmlPreview(partial, stories, { pages: ['1', '2'] }, { paragraphStyle: 'Heading' })
  expect(styled.untitled).toBe(1)
  expect(styled.parts.filter((part) => !part.title).map((part) => part.openerPage)).toEqual(['2'])
  expect(idmlPreview(partial, stories, { pages: ['1', '2'] }, { firstParagraph: true }).parts.map((part) => part.title)).toEqual(['Opening words', 'Body 1'])
})

test('does not count opener-claimed stories as preview chapters', () => {
  const preview = idmlPreview(findings, stories, { pages: ['1'] }, undefined, { claimed: new Set(['story-2']) })
  expect(preview.parts[0]?.chapters).toBe(1)
})
