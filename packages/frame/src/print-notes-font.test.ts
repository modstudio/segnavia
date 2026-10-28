import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { FontRefusedError } from './page-fonts.ts'
import { printDeck } from './print.ts'
import { printableDeck } from './print-document.ts'

const deck = Deck.parse({
  title: 'Notes font',
  size: { width: 400, height: 200 },
  slides: [{ id: 'one', content: { kind: 'html', html: '<p>Slide</p>' }, notes: 'Speak this' }],
})

test('printableDeck names the host notes face in the notes head and leaves sans-serif when none is named', () => {
  const named = printableDeck(deck, {
    layout: 'notes',
    notesFont: 'serif',
    notesFontCss:
      '@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype");font-weight:normal;font-style:normal;font-display:block}:root{--segnavia-font-serif:"Body Serif",serif}',
  })
  expect(named).toContain('font:15px/1.5 var(--segnavia-font-serif);')
  expect(named).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
  expect(named).toContain('--segnavia-font-serif:"Body Serif",serif')
  expect(named).not.toContain('system-ui')
  const unset = printableDeck(deck, { layout: 'notes' })
  expect(unset).toContain('font:15px/1.5 sans-serif;')
  expect(unset).not.toContain('var(--segnavia-font-')
  expect(unset).not.toContain('system-ui')
})

test('printDeck refuses an unknown notesFont before opening a frame', async () => {
  await expect(
    printDeck(deck, {
      layout: 'notes',
      notesFont: 'missing',
      fonts: { source: { font: async () => undefined } },
    }),
  ).rejects.toThrow(FontRefusedError)
  await expect(
    printDeck(deck, {
      layout: 'notes',
      notesFont: 'missing',
      fonts: { source: { font: async () => undefined } },
    }),
  ).rejects.toThrow('notes could not establish app font "missing"; make that font available from the source to clear this refusal.')
})

test('printDeck refuses a named notesFont with no FontSource before opening a frame', async () => {
  await expect(printDeck(deck, { layout: 'notes', notesFont: 'serif' })).rejects.toThrow(FontRefusedError)
  await expect(printDeck(deck, { layout: 'notes', notesFont: 'serif' })).rejects.toThrow(
    'notes could not establish app font "serif"; supply a FontSource to clear this refusal.',
  )
})
