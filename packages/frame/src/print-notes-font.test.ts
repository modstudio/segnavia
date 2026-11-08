import { expect, test } from 'bun:test'
import { type AppFont, Document, type DocumentInput, deckFromDocument, type FontSource } from '@segnavia/format'
import { FontRefusedError, resolveNotesFontCss } from './page-fonts.ts'
import { preparedDeckValuePrint, printDeck } from './print.ts'
import { printableDeckValue } from './print-document.ts'

const deckDocument: DocumentInput = {
  type: 'document',
  kind: 'deck',
  title: 'Notes font',
  size: { width: 400, height: 200 },
  children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<p>Slide</p>' }, notes: 'Speak this' }],
}
const deck = deckFromDocument(Document.parse(deckDocument))

const serif: AppFont = {
  family: 'Body Serif',
  faces: [{ family: 'Body Serif', data: new Uint8Array([0]), format: 'truetype' }],
  generic: 'serif',
}

function source(fonts: Record<string, AppFont>): FontSource {
  return { font: async (name) => fonts[name] }
}

const signal = new AbortController().signal

test('printableDeckValue names the host notes face in the notes head and leaves sans-serif when none is named', async () => {
  const notesSheetFont = await resolveNotesFontCss('serif', { source: source({ serif }) }, signal)
  const named = printableDeckValue(deck, {
    layout: 'notes',
    notesFont: 'serif',
    notesSheetFont,
  })
  expect(named).toContain('font:15px/1.5 var(--segnavia-font-serif);')
  expect(named).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
  expect(named).toContain('--segnavia-font-serif:"Body Serif",serif')
  expect(named).not.toContain('system-ui')
  const unset = printableDeckValue(deck, { layout: 'notes' })
  expect(unset).toContain('font:15px/1.5 sans-serif;')
  expect(unset).not.toContain('var(--segnavia-font-')
  expect(unset).not.toContain('system-ui')
  expect(unset).not.toContain('--segnavia-bleed')
})

test('printableDeckValue refuses a named notesFont without a resolved notes sheet font', () => {
  expect(() => printableDeckValue(deck, { layout: 'notes', notesFont: 'serif' })).toThrow(FontRefusedError)
  expect(() => printableDeckValue(deck, { layout: 'notes', notesFont: 'serif' })).toThrow(
    'notes could not establish app font "serif"; print with printDeck or deckPdf, or resolve it with resolveNotesFontCss and pass the result, to clear this refusal.',
  )
})

test('preparedDeckValuePrint puts the resolved notes face in the notes head', async () => {
  const prepared = await preparedDeckValuePrint(deck, { layout: 'notes', notesFont: 'serif', fonts: { source: source({ serif }) } })
  expect(prepared.html).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
  expect(prepared.html).toContain('var(--segnavia-font-serif)')
})

test('preparedDeckValuePrint continues with fallback for an unknown notesFont', async () => {
  const prepared = await preparedDeckValuePrint(deck, {
    layout: 'notes',
    notesFont: 'missing',
    fonts: { source: { font: async () => undefined } },
  })
  expect(prepared.html).toContain('var(--segnavia-font-missing)')
})

test('printDeck refuses a named notesFont with no FontSource before opening a frame', async () => {
  await expect(printDeck(deckDocument, { layout: 'notes', notesFont: 'serif' })).rejects.toThrow(FontRefusedError)
  await expect(printDeck(deckDocument, { layout: 'notes', notesFont: 'serif' })).rejects.toThrow(
    'notes could not establish app font "serif"; supply a FontSource to clear this refusal.',
  )
})
