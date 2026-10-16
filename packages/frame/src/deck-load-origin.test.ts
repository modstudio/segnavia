import { expect, test } from 'bun:test'
import { deckPreservesNotes, isInternalDeck, markInternalDeckInput, parseDeckLoad, preserveNotesForLoad } from './deck-load-origin.ts'

const input = () => ({ title: 'T', slides: [{ id: 'a', content: { kind: 'html' as const, html: '' } }] })

test('internal load provenance belongs only to the marked parsed deck', () => {
  const internalInput = input()
  const hostInput = input()
  markInternalDeckInput(internalInput)

  const hostDeck = parseDeckLoad(hostInput)
  const internalDeck = parseDeckLoad(internalInput)

  expect(isInternalDeck(hostDeck)).toBe(false)
  expect(isInternalDeck(internalDeck)).toBe(true)
})

test('a failed parse consumes internal load provenance', () => {
  const deckInput: Record<string, unknown> = {}
  markInternalDeckInput(deckInput)
  expect(() => parseDeckLoad(deckInput)).toThrow()
  Object.assign(deckInput, input())

  expect(isInternalDeck(parseDeckLoad(deckInput))).toBe(false)
})

test('notes preservation is scoped to the guarded load promise', () => {
  const guarded = Promise.resolve()
  preserveNotesForLoad(guarded, 'a')

  expect(deckPreservesNotes(parseDeckLoad(input(), guarded), 'a')).toBe(true)
  expect(deckPreservesNotes(parseDeckLoad(input()), 'a')).toBe(false)
})
