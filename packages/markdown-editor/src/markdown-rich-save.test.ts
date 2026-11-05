import { expect, test } from 'bun:test'
import './prosemirror-environment.test-helper.ts'
import type { JSONContent } from '@tiptap/core'
import { Node } from '@tiptap/pm/model'
import { Marked } from 'marked'
import { joinLeadingHeading, splitLeadingHeading } from './markdown-title.ts'

const { listIsLoose, richSchema } = await import('./markdown-rich-extensions.ts')
const { parseRichDocument, saveRichDocument } = await import('./markdown-rich-save.ts')

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
const bulletList = '- Alpha\n- Beta\n'
const taskList = '- [x] Done\n- [ ] Pending\n'
const orderedList = '4. Fourth\n5. Fifth\n'
const nestedList = '- Parent\n  - Child\n- Sibling\n'
const fixtures = {
  table,
  mermaid,
  articles,
  alert,
  directive,
  definition,
  comment,
  frontmatter,
  leadingTitle,
  wrapped,
  blanks,
  bulletList,
  taskList,
  orderedList,
  nestedList,
}
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

test('labeled fences stay locked beside an edit', () => {
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

test('silent blocks keep their position on both sides of an edited paragraph', () => {
  for (const silent of ['<!-- not published -->', '[foo]: /spec']) {
    for (const [markdown, expected] of [
      [`First.\n\n${silent}\n\nSecond.\n`, `First.\n\n${silent}\n\nSecond changed.\n`],
      [`First.\n\nSecond.\n\n${silent}\n`, `First.\n\nSecond changed.\n\n${silent}\n`],
      [`First.\n\nSecond.\n\n${silent}\n\nThird.\n`, `First.\n\nSecond changed.\n\n${silent}\n\nThird.\n`],
    ] as const) {
      const nodes = clone(parseRichDocument(markdown))
      const second = nodes.filter((node) => node.type === 'paragraph')[1]
      if (!second) throw new Error('expected the second paragraph')
      second.content = [{ type: 'text', text: 'Second changed.' }]
      expect(saveRichDocument(markdown, nodes)).toBe(expected)
    }
  }
})

test('editing one list item preserves its untouched siblings', () => {
  const markdown = '- Alpha\n- Beta\n- Gamma\n'
  const nodes = clone(parseRichDocument(markdown))
  const second = nodes[0]?.content?.[1]?.content?.[0]
  if (!second) throw new Error('expected the second list item paragraph')
  second.content = [{ type: 'text', text: 'Beta changed' }]
  expect(saveRichDocument(markdown, nodes)).toBe('- Alpha\n- Beta changed\n- Gamma\n')
})

test('loose bullet, ordered, and task lists stay loose when edited', () => {
  for (const markdown of [
    '- Alpha\n\n- Beta\n',
    '1. One\n\n2. Two\n',
    '- [x] Done\n\n- [ ] Pending\n',
    '- אלף\n\n- בית\n',
    '1. אחד\n\n2. שניים\n',
    '- [x] בוצע\n\n- [ ] ממתין\n',
  ]) {
    const nodes = clone(parseRichDocument(markdown))
    const list = nodes[0]
    expect(list?.attrs?.loose, markdown).toBe(true)
    const firstText = list?.content?.[0]?.content?.[0]?.content?.find((node) => node.type === 'text')
    if (!firstText || typeof firstText.text !== 'string') throw new Error('expected the first list item text')
    firstText.text += ' changed'
    const saved = saveRichDocument(markdown, nodes)
    expect(saved, markdown).toContain('\n\n')
    expect(parseRichDocument(saved)[0]?.attrs?.loose, saved).toBe(true)
  }
})

test('one list-looseness rule matches marked for ordinary and task lists', () => {
  const fixtures = [
    '- Alpha\n- Beta\n',
    '1. One\n2. Two\n',
    '- [x] Done\n- [ ] Pending\n',
    '- אלף\n- בית\n',
    '- [x] Done\n\n- [ ] Pending\n',
    '- [x] First paragraph\n\n  Second paragraph\n- [ ] Pending\n',
    '- [x] Done\n- [ ] Pending\n\n',
    '1. a\n   ```\n   x\n\n   y\n   ```\n2. b\n',
    '- a\n  ```\n  x\n\n  y\n  ```\n- b\n',
    '- Parent\n  - Child\n\n    continuation\n  - Other child\n- Sibling\n',
  ]
  const lexer = new Marked()
  for (const source of fixtures) {
    const ordinary = source.replace(/(\s*[-+*]\s+)\[[ xX]\]\s+/g, '$1')
    const token = lexer.lexer(ordinary)[0]
    expect(listIsLoose(source), source).toBe(token?.type === 'list' && token.loose)
  }
})

test('blank lines inside fenced code and nested lists keep their parent list tight', () => {
  const fixtures = [
    '1. a\n   ```\n   x\n\n   y\n   ```\n2. b\n',
    '- a\n  ```\n  x\n\n  y\n  ```\n- b\n',
    '- Parent\n  - Child\n\n    continuation\n  - Other child\n- Sibling\n',
    '- אב\n  - ילד\n\n    המשך\n  - ילד אחר\n- אח\n',
  ]
  for (const markdown of fixtures) {
    const nodes = clone(parseRichDocument(markdown))
    expect(nodes[0]?.attrs?.loose, markdown).toBe(false)
    const list = nodes[0]
    const lastItem = list?.content?.at(-1)
    const lastText = lastItem?.content?.[0]?.content?.find((node) => node.type === 'text')
    if (!lastText || typeof lastText.text !== 'string') throw new Error('expected the last list item text')
    lastText.text += ' changed'
    const saved = saveRichDocument(markdown, nodes)
    expect(saved, markdown).not.toMatch(/(?:```\n|- Other child\n)\n(?:2\. b|- Sibling)/)
    expect(parseRichDocument(saved)[0]?.attrs?.loose, saved).toBe(false)
  }
})
