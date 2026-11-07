import { Document, type Document as DocumentValue } from './document.ts'
import { DOCUMENT_NODE_MODEL, nodeModel } from './document-op-model.ts'

const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א'

function random(seed: number): { int: (limit: number) => number } {
  let state = (seed ^ 0x9e3779b9) >>> 0
  return {
    int(limit) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % limit
    },
  }
}

function candidates(seed: number): unknown[] {
  const generator = random(seed)
  const bookNodes = [
    { type: 'flow', id: `flow-${seed}`, title: 'Flow', html: `<p>${HEBREW}</p>` },
    { type: 'placed', id: `placed-${seed}`, kind: 'page', address: 'asset' },
    { type: 'contents', id: `contents-${seed}`, title: 'Contents' },
    { type: 'section', id: `section-${seed}`, title: 'Section', children: [{ type: 'flow', id: `nested-flow-${seed}`, html: `<p>${HEBREW}</p>` }] },
    { type: 'part', id: `part-${seed}`, name: 'part', children: [{ type: 'flow', id: `part-flow-${seed}`, title: 'Part flow', html: `<p>${HEBREW}</p>` }] },
    {
      type: 'division',
      id: `division-${seed}`,
      name: 'body',
      children: [{ type: 'flow', id: `division-flow-${seed}`, title: 'Division flow', html: `<p>${HEBREW}</p>` }],
    },
    {
      type: 'section',
      id: `pages-${seed}`,
      title: 'Pages',
      children: [{ type: 'page', id: `book-page-${seed}`, body: { html: `<p>${HEBREW}</p>` } }],
    },
  ]
  return [
    {
      type: 'document',
      id: `book-${seed}`,
      kind: 'book',
      title: 'Book',
      mode: 'continuous',
      style: { css: 'body{}' },
      children: [bookNodes[generator.int(bookNodes.length)]],
      parentPages: [{ type: 'parentPage', id: `parent-${seed}`, name: 'body', geometry: {}, head: HEBREW }],
      templates: [{ type: 'template', id: `template-${seed}`, name: 'body', html: `<header>${HEBREW}</header>` }],
      noteSeries: [{ type: 'noteSeries', id: `notes-${seed}`, name: 'notes' }],
    },
    {
      type: 'document',
      id: `deck-${seed}`,
      kind: 'deck',
      title: 'Deck',
      children: [{ type: 'slide', id: `slide-${seed}`, content: { kind: 'html', html: `<p>${HEBREW}</p>` }, notes: HEBREW }],
    },
    { type: 'document', id: `page-doc-${seed}`, kind: 'page', children: [{ type: 'page', id: `page-${seed}`, body: { html: `<p>${HEBREW}</p>` } }] },
    {
      type: 'document',
      id: `printed-${seed}`,
      kind: 'printed',
      rules: { every: 'body' },
      parentPages: [{ type: 'parentPage', id: `printed-parent-${seed}`, name: 'body', geometry: {}, foot: HEBREW }],
      children: [{ type: 'page', id: `printed-page-${seed}`, body: { html: `<p>${HEBREW}</p>` } }],
    },
    {
      type: 'document',
      id: `board-${seed}`,
      kind: 'board',
      title: 'Board',
      settings: { dir: 'rtl' },
      children: [
        { type: 'item', id: `item-${seed}`, kind: 'page', address: 'asset', x: 0, y: 0, width: 10 },
        { type: 'label', id: `label-${seed}`, text: HEBREW, x: 1, y: 2 },
        { type: 'label', id: `label-b-${seed}`, text: `${HEBREW} ב`, x: 2, y: 3 },
        { type: 'boardSection', id: `board-section-${seed}`, title: 'Section', rectangle: { x: 0, y: 0, width: 20, height: 20 }, items: [] },
      ],
    },
  ]
}

// Reserved profile types are excluded because Document.parse refuses them;
// filtering through parse admits them automatically when their slice enables them.
export function generatedDocument(seed: number): DocumentValue {
  const parsed = candidates(seed).flatMap((candidate) => {
    const result = Document.safeParse(candidate)
    return result.success ? [result.data] : []
  })
  return parsed[random(seed).int(parsed.length)] as DocumentValue
}

export function generatedDocumentOfKind(kind: DocumentValue['kind'], seed: number): DocumentValue {
  const result = candidates(seed).find((candidate) => typeof candidate === 'object' && candidate !== null && (candidate as { kind?: unknown }).kind === kind)
  return Document.parse(result)
}

function allNodes(document: DocumentValue): Array<Record<string, unknown> & { type: string }> {
  const result: Array<Record<string, unknown> & { type: string }> = []
  const visit = (nodes: Array<Record<string, unknown> & { type: string }>): void => {
    for (const node of nodes) {
      result.push(node)
      if (Array.isArray(node.children)) visit(node.children as Array<Record<string, unknown> & { type: string }>)
    }
  }
  visit(document.children as Array<Record<string, unknown> & { type: string }>)
  for (const collection of ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'] as const) visit(document[collection] as never)
  return result
}

function editContent(edited: DocumentValue, seed: number): void {
  const content = allNodes(edited).flatMap((node) =>
    [...(nodeModel(node.type)?.content ?? [])].flatMap((field) => (node[field] === undefined ? [] : [{ node, field }])),
  )
  const held = content[seed % content.length]
  if (held) {
    const value = held.node[held.field]
    if (typeof value === 'string') held.node[held.field] = `${value}${HEBREW}`
    else if (value && typeof value === 'object' && 'html' in value) (value as { html: string }).html += HEBREW
    else if (value && typeof value === 'object' && 'kind' in value && (value as { kind: string }).kind === 'html')
      (value as unknown as { html: string }).html += HEBREW
    else held.node[held.field] = structuredClone(value)
  }
}

function editBoard(edited: DocumentValue, seed: number): void {
  const labels = edited.children.filter((node) => node.type === 'label')
  const mode = random(seed).int(4)
  if (mode === 0 && labels[0]?.type === 'label') labels[0].text += HEBREW
  if (mode === 1) {
    const others = edited.children.filter((node) => node.type !== 'label')
    edited.children = [...others.filter((node) => node.type === 'item'), ...labels.reverse(), ...others.filter((node) => node.type === 'boardSection')]
  }
  if (mode === 2) edited.children.splice(edited.children.length - 1, 0, { type: 'label', id: `label-new-${seed}`, text: HEBREW, x: 3, y: 4 })
  if (mode === 3) edited.children = edited.children.filter((node) => node.id !== labels[1]?.id)
}

export function randomEdit(document: DocumentValue, seed: number): DocumentValue {
  const edited = structuredClone(document) as DocumentValue
  editContent(edited, random(seed).int(10_000))
  if (edited.kind === 'board') editBoard(edited, seed)
  if (edited.kind === 'book' && random(seed + 1).int(3) === 0) edited.style = { ...edited.style, css: `${edited.style?.css ?? ''}p{color:black}` }
  return Document.parse(edited)
}

export const modeledNodeTypes = Object.keys(DOCUMENT_NODE_MODEL)
