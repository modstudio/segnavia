import { expect, test } from 'bun:test'
import './prosemirror-environment.test-helper.ts'
import type { JSONContent } from '@tiptap/core'

const { parseRichDocument, saveRichDocument } = await import('./markdown-rich-save.ts')

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

function expectOnlyWordChanged(source: string, before: string, after: string) {
  const nodes = structuredClone(parseRichDocument(source))
  replaceText(nodes, before, after)
  expect(saveRichDocument(source, nodes)).toBe(source.replace(before, after))
}

test('underscore emphasis and strong delimiters survive a paragraph edit', () => {
  expectOnlyWordChanged('עברית ישנה עם _דגש_ כאן.\n', 'ישנה', 'חדשה')
  expectOnlyWordChanged('עברית ישנה עם __חזק__ כאן.\n', 'ישנה', 'חדשה')
})

test('plus and asterisk bullet markers survive Hebrew list-item edits', () => {
  expectOnlyWordChanged('+ פריט ישן\n+ פריט שני\n', 'ישן', 'חדש')
  expectOnlyWordChanged('* פריט ישן\n* פריט שני\n', 'ישן', 'חדש')
})

test('a setext underline survives a Hebrew heading edit', () => {
  expectOnlyWordChanged('כותרת ישנה\n============  \n', 'ישנה', 'חדשה')
})

test('a backslash hard break survives a Hebrew paragraph edit', () => {
  expectOnlyWordChanged('שורה ישנה\\\nשורה שנייה\n', 'ישנה', 'חדשה')
})

test('tilde and long backtick fences and info spacing survive code edits', () => {
  expectOnlyWordChanged('~~~~  ts extra  \nconst old = 1\n~~~~\n', 'old', 'fresh')
  expectOnlyWordChanged('`````\nold value\n`````\n', 'old', 'fresh')
})

test('ordered delimiters and every written item number survive Hebrew item edits', () => {
  expectOnlyWordChanged('3) פריט ישן\n8) פריט שני\n', 'ישן', 'חדש')
})

test('single and parenthesized mixed-direction link titles survive paragraph edits', () => {
  expectOnlyWordChanged("עברית ישנה [link](/target 'כותרת English עברית').\n", 'ישנה', 'חדשה')
  expectOnlyWordChanged('עברית ישנה [link](/target (כותרת English עברית)).\n', 'ישנה', 'חדשה')
})

test('unchanged table rows and the delimiter row retain their source text', () => {
  const source = '| שם   | מחיר |\n|:------| ----:|\n| ישן | 10 |\n| untouched     | 20    |\n'
  expectOnlyWordChanged(source, 'ישן', 'חדש')
})

test('unlinked brackets stay unescaped when the same reader sees the same paragraph', () => {
  expectOnlyWordChanged('עברית ישנה [sic] כאן.\n', 'ישנה', 'חדשה')
})

test('brackets are escaped when plain output would read back as a link', () => {
  const source = 'Placeholder.\n'
  const nodes = structuredClone(parseRichDocument(source))
  nodes[0] = { type: 'paragraph', content: [{ type: 'text', text: '[link](/target)' }] }
  const saved = saveRichDocument(source, nodes)
  const reparsed = parseRichDocument(saved)[0]?.content ?? []
  expect(reparsed.some((node) => node.marks?.some((mark) => mark.type === 'link'))).toBe(false)
  expect(reparsed.map((node) => node.text ?? node.attrs?.display ?? '').join('')).toBe('[link](/target)')
  expect(saved.match(/\\[\[\]]/g)).toHaveLength(1)
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
  expect(saveRichDocument('', nodes)).toBe(
    '## Heading\n\n*em* **strong**  \n[link](/target "title")\n\n- Bullet\n\n1. Ordered\n\n```ts\ncode\n```\n',
  )
})
