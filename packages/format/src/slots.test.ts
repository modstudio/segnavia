import { describe, expect, test } from 'bun:test'
import { Deck, mergeSlotDeclarations, Page, SlotDeclaration, SlotDeclarationInput, Slots } from './index.ts'

const name = { key: 'person.name', label: 'Name', type: 'text' as const }

describe('slot declarations', () => {
  test('pages and decks read optional declarations without changing old items', () => {
    expect(Page.parse({ html: '<p>Original</p>' }).slots).toBeUndefined()
    expect(Deck.parse({ title: 'Cards', slides: [{ id: 'one', content: { kind: 'html', html: '<p>Original</p>' } }] }).slots).toBeUndefined()
    expect(Page.parse({ html: '', slots: [name] }).slots).toEqual([{ ...name, required: false }])
  })

  test('writes are strict while stored declarations tolerate newer fields', () => {
    expect(SlotDeclaration.parse({ ...name, future: true })).toEqual({ ...name, required: false })
    expect(SlotDeclarationInput.safeParse({ ...name, future: true }).success).toBe(false)
  })

  test('duplicate keys are refused', () => {
    expect(Slots.safeParse([name, name]).success).toBe(false)
  })

  test('document declarations merge identical slots and name conflicts', () => {
    const parsed = SlotDeclaration.parse(name)
    expect(mergeSlotDeclarations([parsed], [parsed])).toEqual([parsed])
    expect(() => mergeSlotDeclarations([parsed], [{ ...parsed, type: 'email' }])).toThrow(
      'Slot "person.name" has conflicting declarations: type text, required false; type email, required false.',
    )
  })
})
