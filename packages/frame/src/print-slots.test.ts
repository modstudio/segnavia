import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { RequiredSlotsRefusedError, SlotFillRefusedError, SlotFillsConflictError, SlotFillsRefusedError } from '@segnavia/html'
import { copiesPrint, printDeck, printPages } from './print.ts'
import { EMPTY_SLOTS } from './slot-render.ts'

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

const imposition = { paper: { unit: 'mm' as const, width: 210, height: 297 }, columns: 1, rows: 1, cell: { width: 210, height: 297 } }

test('browser print refuses fills together with fill', async () => {
  const deck = Deck.parse({ title: 'Fills', slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const slots = { fills: [{ fill: { id: 'ada', values: { name: 'Ada' } } }], fill: { id: 'ada', values: { name: 'Ada' } } }
  await expect(printDeck(deck, { slots })).rejects.toBeInstanceOf(SlotFillsConflictError)
  await expect(printPages([{ html: '<p>Design</p>' }], imposition, { slots })).rejects.toBeInstanceOf(SlotFillsConflictError)
})

test('browser print lists every refused fill before creating output', async () => {
  const declarations = [{ key: 'name', label: 'Name', type: 'text' as const, required: true, placeholder: 'Preview' }]
  const slots = {
    fills: [{ fill: { id: 'missing', values: {} } }, { source: { id: 'staff', values: {} } }],
  }
  const deck = Deck.parse({ title: 'Required', slots: declarations, slides: [{ id: 'one', content: { kind: 'html', html: '<p>Design</p>' } }] })
  const printings = [() => printDeck(deck, { slots }), () => printPages([{ html: '<p>Design</p>', slots: declarations }], imposition, { slots })]
  for (const print of printings) {
    const printing = print()
    await expect(printing).rejects.toBeInstanceOf(SlotFillsRefusedError)
    await expect(printing).rejects.toThrow('"missing" "name" (placeholder); 1 "name" (placeholder)')
  }
})

test('copies print with their own prepared slots, never the caller options', () => {
  const prepared = {
    declarations: [],
    report: { fill: 'a', slots: {}, origins: {} },
    marked: new Map(),
    apply: (html: string) => html,
    mergeFit: () => prepared.report,
  }
  const one = { html: '<!doctype html><html><head></head><body><p>A</p></body></html>', slots: prepared, deadlineMs: 5 }
  const two = { ...one, html: '<!doctype html><html><head></head><body><p>B</p></body></html>' }
  expect(copiesPrint([one] as never)).toBe(one as never)
  const joined = copiesPrint([one, two] as never)
  expect(joined.html).toContain('<p>A</p><p>B</p>')
  expect(joined.slots).toBe(EMPTY_SLOTS)
  expect(joined.deadlineMs).toBe(5)
})
