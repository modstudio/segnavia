/** Regenerate the JSON golden with `bun --conditions=@segnavia/source scripts/update-edit-document-golden.ts --update-golden`. */
import { describe, expect, test } from 'bun:test'
import { applyOps, inverseBatch } from '@segnavia/format'
import { describeDocument } from './describe-document.ts'
import { parseDocument } from './document.ts'
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

describe('editDocument fixture', () => {
  test('matches the full agent-facing JSON golden and composes and inverts its batch', () => {
    const fixture = editDocumentBookFixture()
    expect(JSON.stringify(fixture.golden)).toBe(JSON.stringify(golden))
    expect(fixture.composed).toEqual(fixture.result.document)
    expect(fixture.restored).toEqual(fixture.input)
  })

  test('publishes the command JSON Schema from html', () => {
    expect(documentCommandJsonSchema()).toHaveProperty('oneOf')
  })

  test('bounds concise block text in Unicode code points and leaves full text intact', () => {
    const document = parseDocument({
      type: 'document',
      id: 'bounded',
      kind: 'page',
      limits: { descriptionTextChars: 4 },
      children: [{ type: 'page', id: 'page', body: { html: '<p>בְּרֵאשִׁית</p>' } }],
    })
    expect([...(describeDocument(document).blocks[0]?.text ?? '')]).toHaveLength(4)
    expect(describeDocument(document).blocks[0]?.text.endsWith('…')).toBe(true)
    expect(describeDocument(document, { detail: 'full' }).blocks[0]?.text).toBe('בְּרֵאשִׁית')
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
            ? ([{ type: 'set', node: { id: 'slide' }, fields: { duration: Math.floor(random() * 20) } }] as const)
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
