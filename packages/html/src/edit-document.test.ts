/** Regenerate the JSON golden with `bun --conditions=@segnavia/source scripts/update-edit-document-golden.ts --update-golden`. */
import { describe, expect, test } from 'bun:test'
import { applyOps, type Document, inverseBatch } from '@segnavia/format'
import { describeDocument } from './describe-document.ts'
import { parseDocument } from './document.ts'
import { DOCUMENT_COMMAND_HANDLERS } from './document-command-handlers.ts'
import { documentCommandJsonSchema } from './document-commands.ts'
import { editDocumentBookFixture } from './edit-document.fixture.ts'
import golden from './edit-document.golden.json' with { type: 'json' }
import { editDocument } from './edit-document.ts'

const page = () =>
  parseDocument({
    type: 'document',
    id: 'page-doc',
    kind: 'page',
    children: [{ type: 'page', id: 'page', body: { html: '<p data-segnavia-id="p">Body</p>' } }],
  })

function expectComposes(input: Document, result: ReturnType<typeof editDocument>): asserts result is Extract<typeof result, { ok: true }> {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.refusal)
  expect(applyOps(input, result.batch)).toEqual(result.document)
  expect(applyOps(result.document, inverseBatch(result.batch, result.document))).toEqual(input)
}

describe('editDocument fixture', () => {
  test('matches the full agent-facing JSON golden and composes and inverts its batch', () => {
    const fixture = editDocumentBookFixture()
    expect(JSON.stringify(fixture.golden)).toBe(JSON.stringify(golden))
    expect(fixture.composed).toEqual(fixture.result.document)
    expect(fixture.restored).toEqual(fixture.input)
  })

  test('publishes the command JSON Schema from html', () => {
    const schema = documentCommandJsonSchema() as { oneOf: Array<{ properties: { type: { const: string } } }> }
    expect(schema.oneOf.map((command) => command.properties.type.const).sort()).toEqual(Object.keys(DOCUMENT_COMMAND_HANDLERS).sort())
  })

  test('bounds concise block text without splitting a Hebrew grapheme and leaves full text intact', () => {
    const document = parseDocument({
      type: 'document',
      id: 'bounded',
      kind: 'page',
      limits: { descriptionTextChars: 5 },
      children: [{ type: 'page', id: 'page', body: { html: '<p>בְּרֵאשִׁית</p>' } }],
    })
    expect(describeDocument(document).blocks[0]?.text).toBe('בְּ…')
    expect(describeDocument(document, { detail: 'full' }).blocks[0]?.text).toBe('בְּרֵאשִׁית')
  })

  test('applies the host concise-description ceiling', () => {
    const document = parseDocument({
      type: 'document',
      id: 'bounded-host',
      kind: 'page',
      children: [{ type: 'page', id: 'page', body: { html: '<p>abcdef</p>' } }],
    })
    expect(describeDocument(document, { limits: { descriptionTextChars: 4 } }).blocks[0]?.text).toBe('abc…')
  })
})

describe('editDocument command handlers', () => {
  test('uses parseDocument alert labels when adding a markdown page body', () => {
    const input = parseDocument({
      type: 'document',
      id: 'book',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
      children: [],
    })
    const result = editDocument(
      input,
      [
        {
          type: 'add',
          node: {
            type: 'section',
            id: 'section',
            children: [{ type: 'page', id: 'page', body: { markdown: '> [!NOTE]\n> Read.' } }],
          },
          at: { parent: { id: 'book' }, index: 0 },
        },
      ],
      { alertLabels: { note: 'Custom note' }, newId: () => 'alert-block' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.children[0]).toMatchObject({ children: [{ body: { html: expect.stringContaining('<bdi>Custom note</bdi>') } }] })
  })

  test('sets HTML content, mints its ids and composes and inverts', () => {
    const input = page()
    const result = editDocument(input, [{ type: 'setContent', content: { node: { id: 'page' }, field: 'body' }, html: '<p>New</p>' }], {
      newId: () => 'new-html',
    })
    expectComposes(input, result)
    expect(result.document.children[0]).toMatchObject({ body: { html: '<p data-segnavia-id="new-html">New</p>' } })
    expect(result.added).toEqual({ 0: ['new-html'] })
  })

  test('sets a schema-native content value, mints its ids and composes and inverts', () => {
    const input = page()
    const result = editDocument(input, [{ type: 'setContent', content: { node: { id: 'page' }, field: 'body' }, value: { html: '<p>Native</p>' } }], {
      newId: () => 'new-value',
    })
    expectComposes(input, result)
    expect(result.document.children[0]).toMatchObject({ body: { html: '<p data-segnavia-id="new-value">Native</p>' } })
    expect(result.added).toEqual({ 0: ['new-value'] })
  })

  test('moves a node and composes and inverts', () => {
    const input = parseDocument({
      type: 'document',
      id: 'book',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'continuous',
      children: [
        {
          type: 'part',
          id: 'one',
          name: 'One',
          children: [{ type: 'section', id: 'section', title: 'Section', children: [{ type: 'flow', id: 'flow', html: '' }] }],
        },
        { type: 'part', id: 'two', name: 'Two', children: [] },
      ],
    })
    const result = editDocument(input, [{ type: 'move', node: { id: 'section' }, to: { parent: { id: 'two' }, index: 0 } }])
    expectComposes(input, result)
    expect(result.document.children).toMatchObject([
      { id: 'one', children: [] },
      { id: 'two', children: [{ id: 'section' }] },
    ])
    expect(result.added).toEqual({ 0: [] })
  })

  test('removes a node and composes and inverts', () => {
    const input = parseDocument({
      type: 'document',
      id: 'book',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'continuous',
      children: [
        {
          type: 'part',
          id: 'part',
          name: 'Part',
          children: [{ type: 'section', id: 'section', title: 'Section', children: [{ type: 'flow', id: 'flow', html: '' }] }],
        },
      ],
    })
    const result = editDocument(input, [{ type: 'remove', node: { id: 'section' } }])
    expectComposes(input, result)
    expect(result.document.children[0]).toMatchObject({ children: [] })
    expect(result.added).toEqual({ 0: [] })
  })

  test('sets a block and composes and inverts', () => {
    const input = page()
    const result = editDocument(input, [{ type: 'setBlock', block: 'p', change: { text: 'Changed' } }])
    expectComposes(input, result)
    expect(result.document.children[0]).toMatchObject({ body: { html: '<p data-segnavia-id="p">Changed</p>' } })
    expect(result.added).toEqual({ 0: [] })
  })
})

describe('editDocument refusals', () => {
  test('names an unknown address', () => {
    expect(editDocument(page(), [{ type: 'remove', node: { id: 'missing' } }])).toEqual({
      ok: false,
      refusal: 'document command 0 (remove) refused: node id "missing" is unknown; use the id or unique name of an existing node. Nothing was changed.',
    })
  })

  test('names every id holding an ambiguous name', () => {
    const book = parseDocument({
      type: 'document',
      id: 'book',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'continuous',
      children: [],
      templates: [
        { type: 'template', id: 'a', name: 'same', html: '' },
        { type: 'template', id: 'b', name: 'same', html: '' },
      ],
    })
    const result = editDocument(book, [{ type: 'remove', node: { name: 'same' } }])
    expect(result).toEqual({
      ok: false,
      refusal: 'document command 0 (remove) refused: node name "same" is ambiguous (held by ids "a", "b"); address the node by id. Nothing was changed.',
    })
  })

  test('names an invalid command', () => {
    const result = editDocument(page(), [{ type: 'unknown' } as never])
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.refusal).toMatch(/^document command 0 \(unknown\) refused: .*; pass a command matching DocumentCommand\. Nothing was changed\.$/)
  })

  test('refuses an identity field', () => {
    expect(editDocument(page(), [{ type: 'set', node: { id: 'page' }, fields: { id: 'changed' } }])).toEqual({
      ok: false,
      refusal: 'document command 0 (set) refused: identity field "id" cannot be set; remove it from fields. Nothing was changed.',
    })
  })

  test('carries through a model placement refusal', () => {
    const result = editDocument(page(), [
      { type: 'add', node: { type: 'slide', id: 'slide', content: { kind: 'html', html: '' } }, at: { parent: { id: 'page-doc' }, index: 1 } },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.refusal).toContain('document command 0 (add) refused: document batch refused: the result is not a valid document')
  })

  test('names a missing field on a malformed added node', () => {
    const result = editDocument(page(), [{ type: 'add', node: { type: 'section', id: 'section' }, at: { parent: { id: 'page-doc' }, index: 1 } } as never])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.refusal).toContain('node.children:')
  })

  test('refuses moving a node into its own subtree before building an op', () => {
    const book = parseDocument({
      type: 'document',
      id: 'book',
      kind: 'book',
      metadata: { title: 'Book' },
      mode: 'continuous',
      children: [
        {
          type: 'part',
          id: 'part',
          name: 'Part',
          children: [{ type: 'section', id: 'section', title: 'Section', children: [{ type: 'flow', id: 'flow', html: '' }] }],
        },
      ],
    })
    expect(editDocument(book, [{ type: 'move', node: { id: 'part' }, to: { parent: { id: 'section' }, index: 0 } }])).toEqual({
      ok: false,
      refusal: 'document command 0 (move) refused: node "part" cannot move into its own subtree; choose a location outside that node. Nothing was changed.',
    })
  })

  test('refuses HTML for a text content field', () => {
    const deck = parseDocument({
      type: 'document',
      id: 'deck',
      kind: 'deck',
      title: 'Deck',
      children: [{ type: 'slide', id: 'slide', content: { kind: 'html', html: '<p>Body</p>' }, notes: 'plain' }],
    })
    expect(editDocument(deck, [{ type: 'setContent', content: { node: { id: 'slide' }, field: 'notes' }, html: '<p>Not text</p>' }])).toEqual({
      ok: false,
      refusal: 'document command 0 (setContent) refused: content field "notes" holds text, not HTML; use value instead of html. Nothing was changed.',
    })
  })

  test('requires a key for a record content field', () => {
    expect(editDocument(page(), [{ type: 'setContent', content: { node: { id: 'page' }, field: 'regions' }, html: '<p>Region</p>' }])).toEqual({
      ok: false,
      refusal: 'document command 0 (setContent) refused: record content field "regions" requires a key; supply the record key. Nothing was changed.',
    })
  })

  test('refuses a key on a non-record content field', () => {
    expect(editDocument(page(), [{ type: 'setContent', content: { node: { id: 'page' }, field: 'body', key: 'main' }, html: '<p>Body</p>' }])).toEqual({
      ok: false,
      refusal: 'document command 0 (setContent) refused: content field "body" takes no key; remove the key. Nothing was changed.',
    })
  })

  test('carries through a block refusal with its command index', () => {
    expect(editDocument(page(), [{ type: 'removeBlock', block: 'missing' }])).toEqual({
      ok: false,
      refusal:
        'document command 0 (removeBlock) refused: block id "missing" is unknown; use an id from blockView(document) to clear this refusal; correct the command or document so the step can be established. Nothing was changed.',
    })
  })

  test('refuses a node target on setStyle until the StyleSheet exists', () => {
    const result = editDocument(page(), [{ type: 'setStyle', node: { id: 'page' }, fields: { fonts: [] } } as never])
    expect(result).toEqual({
      ok: false,
      refusal:
        'document command 0 (setStyle) refused: node styles are not present in the current document model; remove the node address; node styles arrive with the StyleSheet. Nothing was changed.',
    })
  })

  test('sets structural fields on the addressed document root', () => {
    const result = editDocument(page(), [{ type: 'set', node: { id: 'page-doc' }, fields: { limits: { descriptionTextChars: 4 } } }])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document.limits).toEqual({ descriptionTextChars: 4 })
  })
})

test('seeded command sequences apply and invert across small books and decks', () => {
  const seed = 389025
  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
  try {
    for (let index = 0; index < 200; index += 1) {
      const deck = index % 2 === 0
      const input = deck
        ? parseDocument({
            type: 'document',
            id: `deck-${index}`,
            kind: 'deck',
            title: 'Deck',
            children: [{ type: 'slide', id: 'slide', content: { kind: 'html', html: '<p data-segnavia-id="block">Body</p>' } }],
          })
        : editDocumentBookFixture().result.document
      const commands =
        random() < 0.25
          ? ([{ type: 'remove', node: { id: 'unknown' } }] as const)
          : deck
            ? ([{ type: 'set', node: { id: 'slide' }, fields: { holdMs: Math.floor(random() * 20) } }] as const)
            : ([{ type: 'set', node: { id: 'section-one' }, fields: { title: `Title ${index}` } }] as const)
      const result = editDocument(input, commands)
      if (!result.ok) {
        expect(result.refusal).toContain('Nothing was changed')
        continue
      }
      expect(applyOps(input, result.batch)).toEqual(result.document)
      expect(applyOps(result.document, inverseBatch(result.batch, result.document))).toEqual(input)
      expect(describeDocument(result.document)).toBeTruthy()
    }
  } catch (error) {
    throw new Error(`seed ${seed}: ${error instanceof Error ? error.message : String(error)}`)
  }
})
