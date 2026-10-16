import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { deckPreservesNotes, isInternalDeck, parseDeckLoad, preserveNotesForLoad } from './deck-load-origin.ts'

const input = () => ({ title: 'T', slides: [{ id: 'a', content: { kind: 'html' as const, html: '' } }] })

test('internal load provenance belongs only to the marked parsed deck', () => {
  const internalInput = input()
  const hostInput = input()

  const hostDeck = parseDeckLoad(hostInput)
  const internalDeck = parseDeckLoad(internalInput, undefined, true)

  expect(isInternalDeck(hostDeck)).toBe(false)
  expect(isInternalDeck(internalDeck)).toBe(true)
})

test('a failed internal parse leaves no provenance on its input', () => {
  const deckInput: Record<string, unknown> = {}
  expect(() => parseDeckLoad(deckInput, undefined, true)).toThrow()
  Object.assign(deckInput, input())

  expect(isInternalDeck(parseDeckLoad(deckInput))).toBe(false)
})

test('notes preservation is scoped to the guarded load promise', () => {
  const guarded = Promise.resolve()
  preserveNotesForLoad(guarded, 'a')

  expect(deckPreservesNotes(parseDeckLoad(input(), guarded), 'a')).toBe(true)
  expect(deckPreservesNotes(parseDeckLoad(input()), 'a')).toBe(false)
})

test('host deck inputs are never mutated for load provenance', async () => {
  const frozen = Object.freeze(input())
  const deletionRefusing = new Proxy(input(), {
    deleteProperty: () => false,
  })
  const oldInternalKey = Symbol.for('@segnavia/frame/internal-deck-input')
  const forged = Object.defineProperty(input(), oldInternalKey, { value: true })

  const controller = new DeckController({ hash: null })
  await expect(controller.load(frozen)).resolves.toBeUndefined()
  await expect(controller.load(deletionRefusing)).resolves.toBeUndefined()
  expect(isInternalDeck(parseDeckLoad(forged))).toBe(false)
})
