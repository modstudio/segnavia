import { expect, test } from 'bun:test'
import './prosemirror-environment.test-helper.ts'
import { marked } from 'marked'

const { richMarkdownManager } = await import('./markdown-rich-extensions.ts')
const { parseRichDocument, saveRichDocument } = await import('./markdown-rich-save.ts')

type Content = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Content[] }

function appendToLastText(nodes: Content[], suffix = ' EDIT') {
  const texts: Content[] = []
  const visit = (node: Content) => {
    if (node.type === 'text') texts.push(node)
    for (const child of node.content ?? []) visit(child)
  }
  for (const node of nodes) visit(node)
  const last = texts.at(-1)
  if (!last || typeof last.text !== 'string') throw new Error('expected an editable text node')
  last.text += suffix
}

function editedRoundTrip(markdown: string): { nodes: Content[]; saved: string } {
  const nodes = structuredClone(parseRichDocument(markdown)) as Content[]
  appendToLastText(nodes)
  return { nodes, saved: saveRichDocument(markdown, nodes) }
}

const inlineCases = [
  ['ASCII escape', String.raw`Keep \# literal.`, String.raw`\#`],
  ['named entity', 'Keep &nbsp; space.', '&nbsp;'],
  ['amp entity', 'Keep &amp; escaped.', '&amp;'],
  ['numeric entity', 'Keep &#160; space.', '&#160;'],
  ['hex entity', 'Keep &#xA0; space.', '&#xA0;'],
  ['footnote reference', 'Keep note[^one].\n\n[^one]: Note text.', '[^one]'],
  ['reference link', 'Keep [text][Ref Label].\n\n[ref   label]: /target', '[text][Ref Label]'],
  ['collapsed link', 'Keep [ref][].\n\n[ref]: /target', '[ref][]'],
  ['shortcut link', 'Keep [ref].\n\n[ref]: /target', '[ref]'],
  ['reference image', 'Keep ![alt][img].\n\n[img]: /image.png', '![alt][img]'],
  ['collapsed image', 'Keep ![img][].\n\n[img]: /image.png', '![img][]'],
  ['shortcut image', 'Keep ![img].\n\n[img]: /image.png', '![img]'],
  ['open and close HTML', 'Keep <kbd>key</kbd> here.', '<kbd>key</kbd>'],
  ['self-closing HTML', 'Keep <i data-x="1"/> here.', '<i data-x="1"/>'],
  ['multi-line HTML', 'See <a\nhref="x">link</a> here.', '<a\nhref="x">'],
  ['inline comment', 'Keep <!-- marker --> here.', '<!-- marker -->'],
] as const

test('opaque inline constructs keep their exact source when their block is edited', () => {
  for (const [name, source, expected] of inlineCases) {
    const { saved } = editedRoundTrip(`${source}\n`)
    expect(saved, name).toContain(expected)
  }
})

test('opaque inline families keep exact source beside Hebrew text', () => {
  const cases = [
    String.raw`עברית \# סימן.`,
    'עברית &nbsp; רווח.',
    'עברית הערה[^א].\n\n[^א]: הגדרה.',
    'עברית [טקסט][קישור].\n\n[קישור]: /target',
    'עברית ![תמונה][קישור].\n\n[קישור]: /image.png',
    'עברית <kbd>מקש</kbd> כאן.',
    'עברית <a\nhref="x">קישור</a> כאן.',
  ]
  for (const source of cases) {
    const expected = source.includes('\n\n')
      ? source.slice(0, source.indexOf('\n\n')).match(/(?:\\.|&[^ ]+;|\[\^[^\]]+\]|!?\[[^\]]+\]\[[^\]]+\]|<kbd>.*<\/kbd>)/)?.[0]
      : source.match(/(?:\\.|&[^ ]+;|<kbd>.*<\/kbd>|<a\nhref="x">.*<\/a>)/)?.[0]
    if (!expected) throw new Error(`missing expected construct in ${source}`)
    expect(editedRoundTrip(`${source}\n`).saved, source).toContain(expected)
  }
})

test('raw inline nodes expose exact source and display attributes', () => {
  const [paragraph] = parseRichDocument(String.raw`A \# &amp; <kbd>x</kbd>.`)
  const raw = paragraph?.content?.filter((node) => node.type === 'rawInline') ?? []
  expect(raw.map((node) => node.attrs)).toEqual([
    { source: String.raw`\#`, display: '#' },
    { source: '&amp;', display: '&amp;' },
    { source: '<kbd>', display: '<kbd>' },
    { source: '</kbd>', display: '</kbd>' },
  ])
})

test('reference labels are normalized and scoped to one parse', () => {
  const defined = parseRichDocument('A [Label].\n\n[ label ]: /target\n')
  expect(defined[0]?.content?.some((node) => node.type === 'rawInline')).toBe(true)
  const undefinedReference = parseRichDocument('A [missing].\n')
  expect(undefinedReference[0]?.content?.some((node) => node.type === 'rawInline')).toBe(false)
  parseRichDocument('A [leak].\n\n[leak]: /target\n')
  const later = parseRichDocument('A [leak].\n')
  expect(later[0]?.content?.some((node) => node.type === 'rawInline')).toBe(false)
})

test('inline links and images stay native when their text is also a definition label', () => {
  const nodes = parseRichDocument('A [label](/inline) and ![label](/image.png).\n\n[label]: /reference\n')
  const content = nodes[0]?.content ?? []
  expect(content.some((node) => node.type === 'rawInline')).toBe(false)
  expect(content.some((node) => node.type === 'image')).toBe(true)
  expect(content.some((node) => node.marks?.some((mark) => mark.type === 'link'))).toBe(true)
})

test('building and using rich managers does not mutate global marked', () => {
  const before = marked.defaults.extensions
  richMarkdownManager()
  parseRichDocument('A [local].\n\n[local]: /target\n')
  expect(marked.defaults.extensions).toBe(before)
})

test('escaped list and heading markers retain paragraph meaning', () => {
  for (const markdown of [String.raw`5786\. A year`, String.raw`\# x`]) {
    const saved = editedRoundTrip(`${markdown}\n`).saved
    expect(parseRichDocument(saved)[0]?.type).toBe('paragraph')
  }
})

test('footnote definitions are locked with indented continuations', () => {
  const source = '[^one]: First line.\n    Continued.\n\n    Another paragraph.'
  const nodes = parseRichDocument(`${source}\n`)
  expect(nodes).toEqual([{ type: 'lockedBlock', attrs: { source, label: null, dir: 'auto' } }])
})
