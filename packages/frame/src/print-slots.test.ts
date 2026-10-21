import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { RequiredSlotsRefusedError, SlotFillRefusedError } from '@segnavia/html'
import { printDeck, printPages } from './print.ts'

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

test('browser deck and page printing refuse every required slot state before creating output', async () => {
  const declarations = [
    { key: 'name', label: 'Name', type: 'text' as const, required: true, placeholder: 'Preview' },
    { key: 'email', label: 'Email', type: 'email' as const, required: true },
    { key: 'site', label: 'Site', type: 'link' as const, required: true },
  ]
  const slots = { fill: { id: 'x', values: { email: 'invalid', site: 'javascript:bad()' } } }
  const deck = Deck.parse({ title: 'Required', slots: declarations, slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const printings = [
    () => printDeck(deck, { slots }),
    () =>
      printPages(
        [{ html: '<p>Design</p>', slots: declarations }],
        { paper: { unit: 'mm', width: 210, height: 297 }, columns: 1, rows: 1, cell: { width: 210, height: 297 } },
        { slots },
      ),
  ]
  for (const print of printings) {
    const printing = print()
    await expect(printing).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
    await expect(printing).rejects.toThrow('"name" (placeholder), "email" (invalid), "site" (invalid)')
  }
})
