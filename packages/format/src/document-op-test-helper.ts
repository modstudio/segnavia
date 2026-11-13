import { Document, type Document as DocumentValue, definitionCollections } from './document.ts'
import { DOCUMENT_NODE_MODEL, type DocumentNodeType, documentEntries, nodeModel, type OperationDocument } from './document-op-model.ts'
import { DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'

export const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א'

function random(seed: number): { int: (limit: number) => number } {
  let state = (seed ^ 0x9e3779b9) >>> 0
  return {
    int(limit) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % limit
    },
  }
}

type Sample = (seed: number) => Record<string, unknown>
export const DOCUMENT_NODE_SAMPLES: Record<DocumentNodeType, Sample> = {
  division: (seed) => ({
    type: 'division',
    id: `division-${seed}`,
    name: 'body',
    children: [{ type: 'flow', id: `division-flow-${seed}`, title: 'Flow', html: HEBREW }],
  }),
  part: (seed) => ({ type: 'part', id: `part-${seed}`, name: 'part', children: [{ type: 'flow', id: `part-flow-${seed}`, title: 'Flow', html: HEBREW }] }),
  section: (seed) => ({ type: 'section', id: `section-${seed}`, title: 'Section', children: [{ type: 'flow', id: `section-flow-${seed}`, html: HEBREW }] }),
  flow: (seed) => ({ type: 'flow', id: `flow-${seed}`, title: 'Flow', html: HEBREW }),
  page: (seed) => ({ type: 'page', id: `page-${seed}`, body: { html: HEBREW } }),
  slide: (seed) => ({ type: 'slide', id: `slide-${seed}`, content: { kind: 'html', html: HEBREW }, notes: HEBREW }),
  placed: (seed) => ({ type: 'placed', id: `placed-${seed}`, kind: 'page', address: 'asset' }),
  contents: (seed) => ({ type: 'contents', id: `contents-${seed}`, title: 'Contents' }),
  record: (seed) => ({ type: 'record', id: `record-${seed}`, template: 'body', values: { name: HEBREW } }),
  item: (seed) => ({ type: 'item', id: `item-${seed}`, kind: 'page', address: 'asset', x: 0, y: 0, width: 10 }),
  label: (seed) => ({ type: 'label', id: `label-${seed}`, text: HEBREW, x: 1, y: 2 }),
  boardSection: (seed) => ({
    type: 'boardSection',
    id: `board-section-${seed}`,
    title: 'Section',
    rectangle: { x: 0, y: 0, width: 20, height: 20 },
    items: [],
  }),
  parentPage: (seed) => ({ type: 'parentPage', id: `parent-${seed}`, name: 'body', geometry: {}, regions: { side: { edge: 'inlineEnd', html: HEBREW } } }),
  template: (seed) => ({ type: 'template', id: `template-${seed}`, name: 'body', html: HEBREW }),
  noteSeries: (seed) => ({ type: 'noteSeries', id: `notes-${seed}`, name: `notes-${seed}`, placement: 'book', numbering: 'book' }),
  variable: (seed) => ({ type: 'variable', id: `variable-${seed}`, name: 'folio', kind: 'folio' }),
  headTemplate: (seed) => ({ type: 'headTemplate', id: `head-template-${seed}`, name: `head-${seed}`, parts: [{ variable: 'folio' }] }),
  condition: (seed) => ({ type: 'condition', id: `condition-${seed}`, name: 'edition' }),
  edition: (seed) => ({ type: 'edition', id: `edition-${seed}`, name: 'teacher', conditions: [] }),
}

function base(kind: DocumentKind, seed: number): Record<string, unknown> {
  const common = { type: 'document', id: kind === 'page' ? `page-document-${seed}` : `${kind}-${seed}`, kind }
  if (kind === 'book')
    return {
      ...common,
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
      style: { css: 'body{}' },
      children: [
        {
          type: 'part',
          id: `part-a-${seed}`,
          name: 'a',
          title: 'Part',
          html: HEBREW,
          children: [{ type: 'section', id: `section-a-${seed}`, title: 'A', children: [{ type: 'flow', id: `flow-a-${seed}`, html: HEBREW }] }],
        },
        {
          type: 'part',
          id: `part-b-${seed}`,
          name: 'b',
          children: [{ type: 'section', id: `section-b-${seed}`, title: 'B', children: [{ type: 'flow', id: `flow-b-${seed}`, html: HEBREW }] }],
        },
      ],
      parentPages: [{ type: 'parentPage', id: `base-parent-${seed}`, name: 'body', geometry: {}, regions: { head: { edge: 'blockStart', html: HEBREW } } }],
      templates: [{ type: 'template', id: `base-template-${seed}`, name: 'body', html: HEBREW, slots: [{ key: 'name', label: 'Name', type: 'text' }] }],
      noteSeries: [{ type: 'noteSeries', id: `base-notes-${seed}`, name: 'notes', placement: 'book', numbering: 'book' }],
    }
  if (kind === 'deck') return { ...common, title: 'Deck', children: [DOCUMENT_NODE_SAMPLES.slide(seed), DOCUMENT_NODE_SAMPLES.slide(seed + 10_000)] }
  if (kind === 'page') return { ...common, style: { fonts: {} }, children: [DOCUMENT_NODE_SAMPLES.page(seed)] }
  if (kind === 'printed')
    return {
      ...common,
      print: { paper: 'a4' },
      parentRules: [{ parent: 'body' }],
      style: { fonts: {} },
      parentPages: [{ type: 'parentPage', id: `printed-parent-${seed}`, name: 'body', geometry: {}, regions: { foot: { edge: 'blockEnd', html: HEBREW } } }],
      children: [DOCUMENT_NODE_SAMPLES.page(seed)],
    }
  return {
    ...common,
    title: 'Board',
    settings: { dir: 'rtl' },
    children: [
      DOCUMENT_NODE_SAMPLES.item(seed),
      DOCUMENT_NODE_SAMPLES.label(seed),
      DOCUMENT_NODE_SAMPLES.label(seed + 10_000),
      DOCUMENT_NODE_SAMPLES.boardSection(seed),
    ],
  }
}

function childForKind(type: DocumentNodeType, kind: DocumentKind, seed: number): Record<string, unknown> {
  const sample = DOCUMENT_NODE_SAMPLES[type](seed)
  if (kind === 'book' && type === 'page') return { type: 'section', id: `page-section-${seed}`, title: 'Pages', children: [sample] }
  return sample
}

function setDefinitionSample(
  candidate: Record<string, unknown>,
  collection: Exclude<NonNullable<ReturnType<typeof nodeModel>>['collection'], undefined>,
  type: DocumentNodeType,
  seed: number,
): void {
  candidate[collection] = [DOCUMENT_NODE_SAMPLES[type](seed)]
  if (collection !== 'conditions') return
  candidate.editions = [{ type: 'edition', id: `condition-edition-${seed}`, name: 'default', conditions: ['edition'] }]
  candidate.defaultEdition = 'default'
}

export function generatedCandidateDocuments(seed: number): DocumentValue[] {
  const candidates: unknown[] = []
  for (const type of Object.keys(DOCUMENT_NODE_MODEL) as DocumentNodeType[]) {
    const collection = nodeModel(type)?.collection
    for (const [kind, profile] of Object.entries(DOCUMENT_PROFILES) as [DocumentKind, (typeof DOCUMENT_PROFILES)[DocumentKind]][]) {
      const candidate = base(kind, seed)
      if (collection && (profile.definitions as readonly string[]).includes(collection)) {
        setDefinitionSample(candidate, collection, type, seed)
      } else if (!collection && (profile.children as readonly string[]).includes(type)) {
        candidate.children =
          kind === 'book' && type === 'contents'
            ? [
                { type: 'division', name: 'front', children: [DOCUMENT_NODE_SAMPLES.contents(seed)] },
                { type: 'division', name: 'body', children: [DOCUMENT_NODE_SAMPLES.flow(seed + 1)] },
              ]
            : [childForKind(type, kind, seed)]
      } else continue
      candidates.push(candidate)
    }
  }
  return candidates.flatMap((candidate) => {
    const result = Document.safeParse(candidate)
    return result.success ? [result.data] : []
  })
}

export function generatedDocument(seed: number): DocumentValue {
  const candidates = generatedCandidateDocuments(seed)
  const kinds: DocumentKind[] = ['book', 'deck', 'page', 'printed', 'board']
  const kind = kinds[seed % kinds.length]
  const matching = candidates.filter((candidate) => candidate.kind === kind)
  return matching[random(seed).int(matching.length)] as DocumentValue
}

export function generatedDocumentOfKind(kind: DocumentKind, seed: number): DocumentValue {
  return Document.parse(base(kind, seed))
}

function nodes(document: DocumentValue) {
  return documentEntries(document as unknown as OperationDocument).map(({ node }) => node)
}

function mutateContent(value: unknown): unknown {
  if (typeof value === 'string') return `${value}${HEBREW}`
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`cannot edit content shape ${JSON.stringify(value)}`)
    const copy = structuredClone(value)
    copy[0] = mutateContent(copy[0])
    return copy
  }
  if (value && typeof value === 'object') {
    const copy = structuredClone(value) as Record<string, unknown>
    const key = Object.keys(copy).find((candidate) => !['kind', 'type', 'id', 'edge'].includes(candidate) && typeof copy[candidate] === 'string')
    if (key) {
      copy[key] = `${copy[key]}${HEBREW}`
      return copy
    }
    const nested = Object.keys(copy).find((candidate) => copy[candidate] && typeof copy[candidate] === 'object')
    if (nested) {
      copy[nested] = mutateContent(copy[nested])
      return copy
    }
  }
  throw new Error(`cannot edit content shape ${JSON.stringify(value)}`)
}

function contentEdit(edited: DocumentValue, seed: number, remove: boolean): boolean {
  const choices = nodes(edited).flatMap((node) =>
    [...(nodeModel(node.type)?.content ?? [])].flatMap((field) => (node[field] === undefined ? [] : [{ node, field }])),
  )
  for (let offset = 0; offset < choices.length; offset += 1) {
    const held = choices[(seed + offset) % choices.length]
    if (!held) continue
    if (!remove) {
      held.node[held.field] = mutateContent(held.node[held.field])
      return true
    }
    const prior = held.node[held.field]
    delete held.node[held.field]
    if (Document.safeParse(edited).success) return true
    held.node[held.field] = prior
  }
  return false
}

function structuralEdit(edited: DocumentValue, seed: number, remove: boolean): boolean {
  for (const node of nodes(edited)) {
    for (const field of nodeModel(node.type)?.settable ?? []) {
      if (node[field] === undefined || typeof node[field] !== 'string') continue
      const prior = node[field]
      if (remove) delete node[field]
      else node[field] = `${prior}${HEBREW}`
      if (Document.safeParse(edited).success) return true
      node[field] = prior
    }
  }
  const title = edited.title
  if (remove && title === undefined) return false
  if (remove) delete edited.title
  else edited.title = `${title ?? ''}${HEBREW}${seed}`
  if (Document.safeParse(edited).success) return true
  edited.title = title
  return false
}

function styleEdit(edited: DocumentValue, remove: boolean): boolean {
  if (edited.kind === 'book') {
    if (remove) edited.style = undefined
    else edited.style = { ...edited.style, css: `${edited.style?.css ?? ''}${HEBREW}` }
    return true
  }
  if (edited.kind === 'page' || edited.kind === 'printed') {
    if (edited.style) edited.style = undefined
    else edited.style = { fonts: {} }
    return true
  }
  return false
}

function bookStructureEdit(edited: DocumentValue, mode: 'insert' | 'remove' | 'within' | 'across', seed: number): boolean {
  if (edited.kind !== 'book') return false
  const root = edited.children as Array<Record<string, unknown> & { type: string; id: string; children?: unknown[] }>
  const held = root.length > 0 && root.every((node) => node.type === 'division') ? (root[0]?.children as typeof root) : root
  if (mode === 'insert') {
    held.push(DOCUMENT_NODE_SAMPLES.part(seed + 20_000) as never)
    return true
  }
  if (mode === 'remove') {
    if (held.length < 2) return false
    const index = held.findIndex((node) => Array.isArray(node.children) && node.children.length > 0)
    if (index >= 0) held.splice(index, 1)
    return index >= 0
  }
  if (mode === 'within' && held.length > 1) {
    held.splice(0, 2, held[1] as never, held[0] as never)
    return true
  }
  if (mode === 'across') {
    const source = held.find((node) => node.type === 'part' && Array.isArray(node.children) && node.children.length > 0)
    if (!source?.children || source.children.length < 2) return false
    const parent = DOCUMENT_NODE_SAMPLES.part(seed + 30_000) as { children: unknown[] }
    parent.children = [source.children.shift()]
    held.push(parent as never)
    return true
  }
  return false
}

function definitionEdit(edited: DocumentValue, seed: number): boolean {
  if (edited.kind !== 'book') return false
  if (seed % 2 === 0) edited.noteSeries.push(DOCUMENT_NODE_SAMPLES.noteSeries(seed + 40_000) as never)
  else {
    if (edited.noteSeries.length === 0) return false
    edited.noteSeries.pop()
  }
  return true
}

export function randomEdit(document: DocumentValue, seed: number): DocumentValue {
  const edited = structuredClone(document) as DocumentValue
  const remove = Math.floor(seed / 9) % 2 === 1
  const action = seed % 9
  const changed =
    (action === 0 && contentEdit(edited, seed, remove)) ||
    (action === 1 && structuralEdit(edited, seed, remove)) ||
    (action === 2 && styleEdit(edited, remove)) ||
    (action === 3 && bookStructureEdit(edited, 'insert', seed)) ||
    (action === 4 && bookStructureEdit(edited, 'remove', seed)) ||
    (action === 5 && bookStructureEdit(edited, 'within', seed)) ||
    (action === 6 && bookStructureEdit(edited, 'across', seed)) ||
    (action === 7 && definitionEdit(edited, seed)) ||
    (action === 8 && contentEdit(edited, seed, false))
  if (!changed && !contentEdit(edited, seed, false) && !structuralEdit(edited, seed, false)) throw new Error(`seed ${seed} produced no valid edit`)
  return Document.parse(edited)
}

export function sampledNodeTypes(document: DocumentValue): Set<string> {
  return new Set(nodes(document).map((node) => node.type))
}

export const sampledCollections = definitionCollections
