import { expect, test } from 'bun:test'
import './prosemirror-environment.test-helper.ts'
import type { JSONContent } from '@tiptap/core'

const { chooseBracketEscapes, parseRichDocument, saveRichDocument } = await import('./markdown-rich-save.ts')

function replaceText(nodes: JSONContent[], before: string, after: string) {
  const visit = (node: JSONContent): boolean => {
    if (typeof node.text === 'string' && node.text.includes(before)) {
      node.text = node.text.replace(before, after)
      return true
    }
    return node.content?.some(visit) ?? false
  }
  if (!nodes.some(visit)) throw new Error(`missing editable word ${before}`)
}

function onlyWordChanged(source: string, before: string, after: string): boolean {
  const nodes = structuredClone(parseRichDocument(source))
  replaceText(nodes, before, after)
  return saveRichDocument(source, nodes) === source.replace(before, after)
}

test('underscore emphasis and strong delimiters survive a paragraph edit', () => {
  expect(onlyWordChanged('עברית ישנה עם _דגש_ כאן.\n', 'ישנה', 'חדשה')).toBe(true)
  expect(onlyWordChanged('עברית ישנה עם __חזק__ כאן.\n', 'ישנה', 'חדשה')).toBe(true)
})

test('plus and asterisk bullet markers survive Hebrew list-item edits', () => {
  expect(onlyWordChanged('+ פריט ישן\n+ פריט שני\n', 'ישן', 'חדש')).toBe(true)
  expect(onlyWordChanged('* פריט ישן\n* פריט שני\n', 'ישן', 'חדש')).toBe(true)
  expect(onlyWordChanged('+ [x] פריט ישן\n+ [ ] פריט שני\n', 'ישן', 'חדש')).toBe(true)
})

test('a setext underline survives a Hebrew heading edit', () => {
  expect(onlyWordChanged('כותרת ישנה\n============  \n', 'ישנה', 'חדשה')).toBe(true)
})

test('a backslash hard break survives a Hebrew paragraph edit', () => {
  expect(onlyWordChanged('שורה ישנה\\\nשורה שנייה\n', 'ישנה', 'חדשה')).toBe(true)
})

test('tilde and long backtick fences and info spacing survive code edits', () => {
  expect(onlyWordChanged('~~~~  ts extra  \nconst old = 1\n~~~~\n', 'old', 'fresh')).toBe(true)
  expect(onlyWordChanged('`````\nold value\n`````\n', 'old', 'fresh')).toBe(true)
})

test('an unsafe recorded fence grows around edited content and leaves the following block outside', () => {
  const source = '~~~\nold\n~~~\n\nFollowing paragraph.\n'
  const nodes = structuredClone(parseRichDocument(source))
  replaceText(nodes, 'old', 'new\n~~~\n```\nstill code')
  expect(saveRichDocument(source, nodes)).toBe('~~~~\nnew\n~~~\n```\nstill code\n~~~~\n\nFollowing paragraph.\n')
})

test('ordered delimiters and every written item number survive Hebrew item edits', () => {
  expect(onlyWordChanged('3) פריט ישן\n8) פריט שני\n', 'ישן', 'חדש')).toBe(true)
})

test('reordered items use default numbering for the whole ordered list', () => {
  const source = '1) first\n2) second\n'
  const nodes = structuredClone(parseRichDocument(source))
  const items = nodes[0]?.content
  const first = items?.[0]
  const second = items?.[1]
  if (!first || !second || items?.length !== 2) throw new Error('missing ordered list items')
  nodes[0] = { ...nodes[0], content: [second, first] }
  expect(saveRichDocument(source, nodes)).toBe('1) second\n2) first\n')
})

test('a nested non-default bullet marker survives a nested item edit', () => {
  expect(onlyWordChanged('- Parent\n  + Child old\n  + Inner\n- Sibling\n', 'old', 'new')).toBe(true)
})

test('single and parenthesized mixed-direction link titles survive paragraph edits', () => {
  expect(onlyWordChanged("עברית ישנה [link](/target 'כותרת English עברית').\n", 'ישנה', 'חדשה')).toBe(true)
  expect(onlyWordChanged('עברית ישנה [link](/target (כותרת English עברית)).\n', 'ישנה', 'חדשה')).toBe(true)
})

test('unsafe recorded link-title quotes fall back to a reparseable quote', () => {
  for (const [source, punctuation] of [
    ["עברית [link](/target 'mixed עברית').\n", "'"],
    ['עברית [link](/target (mixed עברית)).\n', ')'],
  ] as const) {
    const nodes = structuredClone(parseRichDocument(source))
    const mark = nodes[0]?.content?.find((node) => node.marks?.some((item) => item.type === 'link'))?.marks?.find((item) => item.type === 'link')
    if (!mark?.attrs || typeof mark.attrs.title !== 'string') throw new Error('missing link title')
    mark.attrs.title += punctuation
    const saved = saveRichDocument(source, nodes)
    expect(saved).toContain(`"${mark.attrs.title}"`)
    expect(parseRichDocument(saved)[0]?.content?.some((node) => node.marks?.some((item) => item.type === 'link'))).toBe(true)
  }
})

test('entities do not discard recorded forms during Hebrew paragraph edits', () => {
  expect(onlyWordChanged('_מילה_ ו-&nbsp; טקסט ישן.\n', 'ישן', 'חדש')).toBe(true)
  expect(onlyWordChanged('_מילה_ ו-&#65; טקסט ישן.\n', 'ישן', 'חדש')).toBe(true)
})

test('unchanged table rows and the delimiter row retain their source text', () => {
  const source = '| שם   | מחיר |\n|:------| ----:|\n| ישן | 10 |\n| untouched     | 20    |\n'
  expect(onlyWordChanged(source, 'ישן', 'חדש')).toBe(true)
})

test('unlinked brackets stay unescaped when the same reader sees the same paragraph', () => {
  expect(onlyWordChanged('עברית ישנה [sic] כאן.\n', 'ישנה', 'חדשה')).toBe(true)
})

test('brackets are escaped when plain output would read back as a link', () => {
  const source = 'Placeholder.\n'
  const nodes = structuredClone(parseRichDocument(source))
  nodes[0] = { type: 'paragraph', content: [{ type: 'text', text: '[link](/target)' }] }
  const saved = saveRichDocument(source, nodes)
  const reparsed = parseRichDocument(saved)[0]?.content ?? []
  expect(reparsed.some((node) => node.marks?.some((mark) => mark.type === 'link'))).toBe(false)
  expect(reparsed.map((node) => node.text ?? node.attrs?.display ?? '').join('')).toBe('[link](/target)')
  expect(saved.match(/\\(?:\[|\])/g)).toHaveLength(1)
})

test('bracket selection uses the all-unescaped, selective, and conservative paths', () => {
  expect(
    chooseBracketEscapes(
      '\\[plain\\]',
      (value) => value === '[plain]',
      () => [],
    ),
  ).toEqual({ markdown: '[plain]', same: true })
  expect(
    chooseBracketEscapes(
      '\\[link\\](/target)',
      (value) => value === '\\[link](/target)',
      () => [0],
    ),
  ).toEqual({ markdown: '\\[link](/target)', same: true })
  expect(
    chooseBracketEscapes(
      '\\[unknown\\]',
      () => false,
      () => [],
    ),
  ).toEqual({ markdown: '\\[unknown\\]', same: false })
})

test('command-created nodes use the current default source forms', () => {
  const nodes: JSONContent[] = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'em', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' strong', marks: [{ type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: '/target', title: 'title' } }] },
      ],
    },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet' }] }] }],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ordered' }] }] }],
    },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'code' }] },
  ]
  expect(saveRichDocument('', nodes)).toBe('## Heading\n\n*em* **strong**  \n[link](/target "title")\n\n- Bullet\n\n1. Ordered\n\n```ts\ncode\n```\n')
})

test('a recorded form that changes meaning in its new context falls back to the default', () => {
  const source = 'A _word_ here.\n'
  const nodes = structuredClone(parseRichDocument(source))
  const leading = nodes[0]?.content?.[0]
  if (leading?.text !== 'A ') throw new Error('missing leading text')
  leading.text = 'A'
  expect(saveRichDocument(source, nodes)).toBe('A*word* here.\n')
})
