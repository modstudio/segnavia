import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import { DocumentJsonSchema } from './document-json-schema.ts'
import { DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'
import { jsonSchemas } from './json-schemas.ts'

type JsonObject = Record<string, unknown>

const schema = jsonSchemas().document as JsonObject
const definitions = schema.$defs as JsonObject

function object(value: unknown): JsonObject {
  expect(value).toBeObject()
  return value as JsonObject
}

function resolve(value: unknown): JsonObject {
  const held = object(value)
  const reference = held.$ref
  if (typeof reference !== 'string') return held
  return object(definitions[reference.replace('#/$defs/', '')])
}

function branch(kind: DocumentKind): JsonObject {
  const branches = schema.oneOf as JsonObject[]
  const found = branches.find((candidate) => object(object(candidate.properties).kind).const === kind)
  expect(found).toBeDefined()
  return object(found)
}

function properties(value: JsonObject): JsonObject {
  return object(value.properties)
}

function childNodeBranches(value: JsonObject): JsonObject[] {
  const children = object(properties(value).children)
  return resolve(children.items).oneOf as JsonObject[]
}

function node(value: JsonObject, type: string): JsonObject {
  const found = childNodeBranches(value).find((candidate) => object(properties(candidate).type).const === type)
  expect(found).toBeDefined()
  return object(found)
}

function nodeTypes(value: JsonObject): string[] {
  return childNodeBranches(value).map((candidate) => object(properties(candidate).type).const as string)
}

function rootFields(kind: DocumentKind): string[] {
  const profile = DOCUMENT_PROFILES[kind]
  return ['type', 'id', 'kind', 'children', ...profile.definitions, ...profile.fields]
}

describe('document JSON Schema', () => {
  test('is one branch per profile kind in profile order', () => {
    const branches = schema.oneOf as JsonObject[]
    expect(branches).toHaveLength(5)
    expect(branches.map((candidate) => object(properties(candidate).kind).const)).toEqual(Object.keys(DOCUMENT_PROFILES))
  })

  test('selects node types recursively from each profile', () => {
    expect(nodeTypes(branch('deck'))).toEqual(['slide'])
    expect(nodeTypes(branch('board'))).toEqual(['item', 'label', 'boardSection'])

    const bookSection = node(branch('book'), 'section')
    expect(nodeTypes(bookSection)).toEqual([...DOCUMENT_PROFILES.book.children])
    expect(nodeTypes(node(branch('book'), 'division'))).toEqual([...DOCUMENT_PROFILES.book.children])
    expect(nodeTypes(node(branch('book'), 'part'))).toEqual([...DOCUMENT_PROFILES.book.children])
    expect(nodeTypes(bookSection)).toContain('flow')
    expect(nodeTypes(bookSection)).toContain('contents')

    const printedSection = node(branch('printed'), 'section')
    expect(nodeTypes(printedSection)).toContain('flow')
    expect(nodeTypes(printedSection)).not.toContain('contents')
  })

  test('selects section fields from each profile', () => {
    const printed = properties(node(branch('printed'), 'section'))
    expect(printed).toHaveProperty('title')
    expect(printed).toHaveProperty('dir')
    expect(printed).toHaveProperty('lang')
    expect(printed).not.toHaveProperty('contentsLabel')
    expect(properties(node(branch('book'), 'section'))).toHaveProperty('contentsLabel')
    expect(properties(node(branch('printed'), 'page'))).not.toHaveProperty('template')
  })

  test('publishes profile required fields and restricted root objects', () => {
    expect(branch('book').required).toEqual(['type', 'kind', 'children', 'mode'])
    expect(branch('printed').required).toEqual(['type', 'kind', 'children', 'parentPages', 'parentRules'])
    expect(properties(branch('printed')).parentPages).toMatchObject({ minItems: 1 })
    for (const kind of Object.keys(DOCUMENT_PROFILES) as DocumentKind[]) expect(branch(kind).required).not.toContain('title')

    expect(Object.keys(properties(resolve(properties(branch('deck')).metadata)))).toEqual(['title'])
    const boardSettings = properties(resolve(properties(branch('board')).settings))
    expect(Object.keys(boardSettings)).toEqual(['dir'])
    expect(object(boardSettings.dir).enum).not.toContain('auto')
  })

  test('publishes profile child count limits', () => {
    expect(properties(branch('page')).children).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(properties(branch('deck')).children).toMatchObject({ minItems: 1 })
  })

  test('keeps every branch root field set aligned with its profile', () => {
    for (const kind of Object.keys(DOCUMENT_PROFILES) as DocumentKind[]) {
      expect(new Set(Object.keys(properties(branch(kind))))).toEqual(new Set(rootFields(kind)))
    }
  })

  test('accepts documents accepted by the parser for every kind', () => {
    const documents = [
      {
        type: 'document',
        kind: 'book',
        metadata: { title: 'Book' },
        mode: 'continuous',
        children: [{ type: 'section', title: 'Body', dir: 'rtl', lang: 'he', children: [{ type: 'flow', html: '<p>Body</p>' }] }],
      },
      {
        type: 'document',
        kind: 'printed',
        parentPages: [{ type: 'parentPage', name: 'body' }],
        parentRules: [{ parent: 'body' }],
        print: { paper: 'a4' },
        children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
      },
      { type: 'document', kind: 'deck', metadata: { title: 'Deck' }, children: [{ type: 'slide', content: { kind: 'html', html: '' } }] },
      { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Body</p>' } }] },
      { type: 'document', kind: 'board', metadata: { title: 'Board' }, settings: { dir: 'rtl' }, children: [] },
    ]

    for (const document of documents) {
      expect(Document.safeParse(document).success).toBeTrue()
      expect(DocumentJsonSchema.safeParse(document).success).toBeTrue()
    }
  })
})
