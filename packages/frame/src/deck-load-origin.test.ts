import { expect, test } from 'bun:test'
import type { Brand, BrandSource } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { comparableContent } from './content-value.ts'
import { DeckController } from './controller.ts'
import { deckPreservesNotes, isInternalDeck, parseDeckLoad, preserveNotesForLoad, resolveDeckLoad } from './deck-load-origin.ts'

const input = () => ({ title: 'T', slides: [{ id: 'a', content: { kind: 'html' as const, html: '' } }] })
const documentInput = () => ({
  type: 'document' as const,
  kind: 'deck' as const,
  title: 'T',
  children: [{ type: 'slide' as const, id: 'a', content: { kind: 'html' as const, html: '' } }],
})

test('internal load provenance belongs only to the marked parsed deck', () => {
  const internalInput = input()
  const hostInput = documentInput()

  const hostDeck = parseDeckLoad(hostInput)
  const internalDeck = parseDeckLoad(internalInput, undefined, true)

  expect(isInternalDeck(hostDeck)).toBe(false)
  expect(isInternalDeck(internalDeck)).toBe(true)
})

test('a failed internal parse leaves no provenance on its input', () => {
  const deckInput: Record<string, unknown> = {}
  expect(() => parseDeckLoad(deckInput, undefined, true)).toThrow()
  Object.assign(deckInput, input())

  expect(isInternalDeck(parseDeckLoad(documentInput()))).toBe(false)
})

test('notes preservation is scoped to the guarded load promise', () => {
  const guarded = Promise.resolve()
  preserveNotesForLoad(guarded, 'a')

  expect(deckPreservesNotes(parseDeckLoad(input(), guarded, true), 'a')).toBe(true)
  expect(deckPreservesNotes(parseDeckLoad(documentInput()), 'a')).toBe(false)
})

test('resolved document loads use the shared provenance record', async () => {
  const guarded = Promise.resolve()
  preserveNotesForLoad(guarded, 'a')
  const deck = await resolveDeckLoad(documentInput(), undefined, new AbortController().signal, guarded)

  expect(deckPreservesNotes(deck, 'a')).toBe(true)
  expect(isInternalDeck(deck)).toBe(false)
})

test('host deck inputs are never mutated for load provenance', async () => {
  const frozen = Object.freeze(input())
  const deletionRefusing = new Proxy(input(), {
    deleteProperty: () => false,
  })
  const oldInternalKey = Symbol.for('@segnavia/frame/internal-deck-input')
  const forged = Object.defineProperty(input(), oldInternalKey, { value: true })

  const controller = new DeckController({ hash: null })
  await expect(controller.loadDeckValue(frozen)).resolves.toBeUndefined()
  await expect(controller.loadDeckValue(deletionRefusing)).resolves.toBeUndefined()
  expect(() => parseDeckLoad(forged)).toThrow()
})

test('a host deck load refuses another document kind and names the accepted kind', () => {
  expect(() =>
    parseDeckLoad({ type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children: [{ type: 'flow', title: 'Body', html: '' }] }),
  ).toThrow('document kind book is not accepted here; use kind deck to clear this refusal')
})

test('loading the same parsed Document keeps comparable content equal for every slide', () => {
  const host = documentInput()
  const firstChild = host.children[0]
  if (!firstChild) throw new Error('the fixture needs a slide')
  firstChild.content.html = '<h1>Same</h1>'
  host.children.push({ type: 'slide', id: 'b', content: { kind: 'html', html: '<p>Second</p>' } })
  const parsed = parseDocument(host)
  const first = parseDeckLoad(parsed)
  const second = parseDeckLoad(parsed)
  const values = (deck: typeof first) =>
    deck.slides.map((slide) => {
      if (!('kind' in slide.content) || slide.content.kind !== 'html') throw new Error('the fixture needs HTML slides')
      return comparableContent(slide.content, (path) => path, deck.scripts, '', '')
    })

  expect(first.slides.every((slide) => 'kind' in slide.content && slide.content.kind === 'html' && slide.content.html.includes('data-segnavia-id'))).toBe(true)
  expect(values(first)).toEqual(values(second))
})

test('controller resolves a named brand before the first slide', async () => {
  const source: BrandSource = {
    brand: async (name): Promise<Brand | undefined> => (name === 'house' ? { tokens: { colors: { ink: '#123456' } } } : undefined),
  }
  const controller = new DeckController({
    hash: null,
    brands: { source },
  })
  await controller.load({ ...documentInput(), brand: 'house' })
  expect(controller.state.deck?.brand).toEqual({ tokens: { colors: { ink: '#123456' } } })
})

test.each([
  [undefined, /without a BrandSource/],
  [{ source: { brand: async (): Promise<Brand | undefined> => undefined } }, /unknown to the BrandSource/],
  [{ source: { brand: async (): Promise<Brand | undefined> => ({ stray: true }) as never } }, /invalid style sheet.*stray/],
] as const)('controller reports brand refusal %#', async (brands, message) => {
  const controller = new DeckController({ hash: null, brands })
  await expect(controller.load({ ...documentInput(), brand: 'house' })).rejects.toThrow(message)
})

test('the latest overlapping branded load is the only deck that commits', async () => {
  let resolveFirst!: (brand: Brand) => void
  let firstSignal: AbortSignal | undefined
  const firstBrand = new Promise<Brand>((resolve) => {
    resolveFirst = resolve
  })
  const source: BrandSource = {
    brand: async (name, { signal }) => {
      if (name === 'first') {
        firstSignal = signal
        return firstBrand
      }
      return { css: '.second{color:blue}' }
    },
  }
  const controller = new DeckController({ hash: null, brands: { source } })
  const first = controller.load({ ...documentInput(), title: 'First', brand: 'first' })
  await Promise.resolve()
  const second = controller.load({ ...documentInput(), title: 'Second', brand: 'second' })

  await second
  resolveFirst({ css: '.first{color:red}' })
  await expect(first).resolves.toBeUndefined()

  expect(firstSignal?.aborted).toBe(true)
  expect(controller.state.deck?.title).toBe('Second')
})
