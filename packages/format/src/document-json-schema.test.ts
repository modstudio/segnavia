import { describe, expect, test } from 'bun:test'
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

  test('selects root fields from each profile', () => {
    expect(Object.keys(properties(branch('book')))).toEqual(rootFields('book'))
    expect(properties(branch('deck'))).not.toHaveProperty('mode')
    expect(properties(branch('deck'))).not.toHaveProperty('page')
    expect(properties(branch('printed'))).not.toHaveProperty('metadata')
  })

  test('selects node types recursively from each profile', () => {
    expect(nodeTypes(branch('deck'))).toEqual(['slide'])
    expect(nodeTypes(branch('board'))).toEqual(['item', 'label', 'boardSection'])

    const bookSection = node(branch('book'), 'section')
    expect(nodeTypes(bookSection)).toEqual([...DOCUMENT_PROFILES.book.children])
    expect(nodeTypes(bookSection)).toContain('flow')
    expect(nodeTypes(bookSection)).toContain('contents')

    const printedSection = node(branch('printed'), 'section')
    expect(nodeTypes(printedSection)).toContain('flow')
    expect(nodeTypes(printedSection)).not.toContain('contents')
  })

  test('selects section fields from each profile', () => {
    const printed = properties(node(branch('printed'), 'section'))
    expect(printed).toHaveProperty('title')
    expect(printed).not.toHaveProperty('contentsLabel')
    expect(properties(node(branch('book'), 'section'))).toHaveProperty('contentsLabel')
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
})
