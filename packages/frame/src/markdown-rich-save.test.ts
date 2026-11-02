import { expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { Node } from '@tiptap/pm/model'
import { richSchema } from './markdown-rich-extensions.ts'
import { parseRichDocument, saveRichDocument } from './markdown-rich-save.ts'
import { joinLeadingHeading, splitLeadingHeading } from './markdown-title.ts'

const bodyTransform = { split: splitLeadingHeading, join: joinLeadingHeading }
const lockedFences = { articles: 'Generated list' }
const table = '| Name | Price |\n| --- | --- |\n| Seat | 10 |\n'
const mermaid = '```mermaid\nflowchart LR\nA-->B\n```\n'
const articles = '```articles\n```\n'
const alert = '> [!NOTE]\n> Keep the receipt.\n'
const directive = ':::section{audience=technical}\nShown to builders.\n:::\n'
const definition = 'See the [spec][foo].\n\n[foo]: /spec\n'
const comment = 'Before.\n\n<!-- not published -->\n\nAfter.\n'
const frontmatter = '---\ntitle: Pricing\n---\n\nThe fare.\n'
const leadingTitle = '# Product pricing\n\nThe fare is public.\n'
const wrapped = 'This paragraph is\nhard wrapped onto two lines.\n'
const blanks = 'First block.\n\n\n\nSecond block.\n'
const fixtures = { table, mermaid, articles, alert, directive, definition, comment, frontmatter, leadingTitle, wrapped, blanks }
const clone = (nodes: JSONContent[]) => structuredClone(nodes)

function setParagraphText(nodes: JSONContent[], text: string) {
  const paragraph = nodes.find((node) => node.type === 'paragraph')
  if (!paragraph) throw new Error('expected a paragraph')
  paragraph.content = [{ type: 'text', text }]
}

test('every reference fixture saves byte-for-byte without edits', () => {
  for (const [name, markdown] of Object.entries(fixtures)) expect(saveRichDocument(markdown, parseRichDocument(markdown)), name).toBe(markdown)
})

test('editing one paragraph changes only that paragraph', () => {
  const rest = `${mermaid}\n${alert}\n${table}\n<!-- not published -->\n\n[foo]: /spec\n`
  const markdown = `Alpha line.\n\n${rest}`
  const nodes = clone(parseRichDocument(markdown))
  setParagraphText(nodes, 'Alpha line extra.')
  expect(saveRichDocument(markdown, nodes)).toBe(`Alpha line extra.\n\n${rest}`)
})

test('labelled fences stay locked beside an edit', () => {
  const fence = '```articles\n```'
  const markdown = `Intro line.\n\n${fence}\n`
  const nodes = clone(parseRichDocument(markdown, { lockedFences }))
  expect(nodes[1]).toEqual({ type: 'lockedBlock', attrs: { source: fence, label: 'Generated list', dir: 'auto' } })
  setParagraphText(nodes, 'Intro line changed.')
  expect(saveRichDocument(markdown, nodes, { lockedFences })).toBe(`Intro line changed.\n\n${fence}\n`)
})

test('deleting and inserting blocks preserves their neighbors', () => {
  const markdown = 'Left wrap\nstays.\n\nRight wrap\nstays.\n'
  const deleted = clone(parseRichDocument(markdown)).filter((_, index) => index !== 1)
  expect(saveRichDocument(markdown, deleted)).toBe('Left wrap\nstays.\n')
  const inserted = clone(parseRichDocument(markdown))
  inserted.splice(1, 0, { type: 'paragraph', content: [{ type: 'text', text: 'Inserted.' }] })
  expect(saveRichDocument(markdown, inserted)).toBe('Left wrap\nstays.\n\nInserted.\n\nRight wrap\nstays.\n')
})

test('ampersands and schema-default nodes survive an edit', () => {
  const rest = `${table}\nSee [the spec](https://example.com/spec).\n\n1. one\n2. two\n`
  const markdown = `A & B together.\n\n${rest}`
  const nodes = Node.fromJSON(richSchema(), { type: 'doc', content: parseRichDocument(markdown) }).toJSON().content as JSONContent[]
  setParagraphText(nodes, 'A & B together still.')
  expect(saveRichDocument(markdown, nodes)).toBe(`A & B together still.\n\n${rest}`)
})

test('repository leading headings stay outside the document and retain their line break', () => {
  for (const markdown of ['# Product pricing\n\nThe fare is public.\n', '\n# Product pricing\nThe fare is public.\n']) {
    const nodes = parseRichDocument(markdown, { bodyTransform })
    expect(nodes.some((node) => node.type === 'heading' && node.attrs?.level === 1)).toBe(false)
    const edited = clone(nodes)
    setParagraphText(edited, 'The fare is public now.')
    expect(saveRichDocument(markdown, edited, { bodyTransform })).toContain('# Product pricing\n')
  }
})

test('an inline image survives editing its paragraph', () => {
  const markdown = 'Before ![alt](https://example.com/p.png) after.\n'
  const nodes = clone(parseRichDocument(markdown))
  nodes[0]?.content?.push({ type: 'text', text: ' More.' })
  expect(saveRichDocument(markdown, nodes)).toContain('![alt](https://example.com/p.png)')
})
