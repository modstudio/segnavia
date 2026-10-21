import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { SlotFillRefusedError } from '@segnavia/html'
import { printDeck } from './print.ts'

test('browser print refuses a fill for a scripted deck before reporting', async () => {
  let reports = 0
  const deck = Deck.parse({
    title: 'Private fill',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="name">Authored</p>' } }],
  })
  await expect(
    printDeck(deck, {
      slots: {
        fill: { id: 'private', values: { name: 'Filled' } },
        report: () => reports++,
      },
    }),
  ).rejects.toBeInstanceOf(SlotFillRefusedError)
  expect(reports).toBe(0)
})
