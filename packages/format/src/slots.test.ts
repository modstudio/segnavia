import { describe, expect, test } from 'bun:test'
import { Deck, mergeSlotDeclarations, Page, SlotDeclaration, SlotDeclarationInput, Slots } from './index.ts'

const name = { key: 'person.name', label: 'Name', type: 'text' as const }

describe('slot declarations', () => {
  test('pages and decks read optional declarations without changing old items', () => {
    expect(Page.parse({ html: '<p>Original</p>' }).slots).toBeUndefined()
    expect(Deck.parse({ title: 'Cards', slides: [{ id: 'one', content: { kind: 'html', html: '<p>Original</p>' } }] }).slots).toBeUndefined()
    expect(Page.parse({ html: '', slots: [name] }).slots).toEqual([{ ...name, required: false, overflow: 'wrap' }])
  })

  test('writes are strict while stored declarations tolerate newer fields', () => {
    expect(SlotDeclaration.parse({ ...name, future: true })).toEqual({ ...name, required: false, overflow: 'wrap' })
    expect(SlotDeclarationInput.safeParse({ ...name, future: true }).success).toBe(false)
  })

  test('duplicate keys are refused', () => {
    expect(Slots.safeParse([name, name]).success).toBe(false)
  })

  test('QR is a declared slot type', () => {
    expect(SlotDeclaration.parse({ key: 'website', label: 'Website QR', type: 'qr' })).toEqual({
      key: 'website',
      label: 'Website QR',
      type: 'qr',
      required: false,
      overflow: 'wrap',
    })
  })

  test('overflow defaults and refuses declarations on non-text slots', () => {
    expect(SlotDeclaration.parse({ ...name, overflow: 'shrink' })).toEqual({ ...name, required: false, overflow: 'shrink', minSize: 6 })
    expect(SlotDeclaration.parse({ ...name, overflow: 'shrink', minSize: 9 })).toEqual({
      ...name,
      required: false,
      overflow: 'shrink',
      minSize: 9,
    })
    expect(() => SlotDeclaration.parse({ key: 'code', label: 'Code', type: 'qr', overflow: 'truncate' })).toThrow('overflow cannot be declared for qr slots')
    expect(() => SlotDeclaration.parse({ key: 'photo', label: 'Photo', type: 'image', overflow: 'refuse' })).toThrow(
      'overflow cannot be declared for image slots',
    )
  })

  test('document declarations merge identical slots and name conflicts', () => {
    const parsed = SlotDeclaration.parse(name)
    expect(mergeSlotDeclarations([parsed], [parsed])).toEqual([parsed])
    expect(() => mergeSlotDeclarations([parsed], [{ ...parsed, type: 'email' }])).toThrow(
      'Slot "person.name" has conflicting declarations: type text, required false, overflow wrap; type email, required false, overflow wrap.',
    )
  })
})
