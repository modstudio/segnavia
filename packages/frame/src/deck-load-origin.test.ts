import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { deckPreservesNotes, isInternalDeck, parseDeckLoad, preserveNotesForLoad } from './deck-load-origin.ts'

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
  expect(() => parseDeckLoad({ type: 'document', kind: 'book', children: [] })).toThrow(
    'document kind book is not accepted here; use kind deck to clear this refusal',
  )
})
