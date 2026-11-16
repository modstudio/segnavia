import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { SoundPrintRefusedError } from '@segnavia/html'
import { printableDeck, printableDeckValue, printableDeckValueDocument } from './print-document.ts'

const input = {
  type: 'document' as const,
  kind: 'deck' as const,
  title: 'Sound',
  children: [{ type: 'slide' as const, id: 'sound', content: { media: { kind: 'sound' as const, address: 'theme' } } }],
}

const sound = Deck.parse({
  title: 'Sound',
  size: { width: 1280, height: 720 },
  slides: [{ id: 'sound', content: { media: { kind: 'sound', address: 'theme' } } }],
})

test('declared sounds refuse every printable deck entry point before a placeholder is emitted', () => {
  expect(() => printableDeck(input)).toThrow(SoundPrintRefusedError)
  expect(() => printableDeckValue(sound)).toThrow(SoundPrintRefusedError)
  expect(() =>
    printableDeckValueDocument(sound, {
      imposition: {
        paper: { width: 230, height: 320, unit: 'mm' },
        columns: 2,
        rows: 3,
        cell: { width: 100, height: 80 },
        margin: { top: 20, right: 10, bottom: 20, left: 10 },
        gap: { column: 10, row: 20 },
      },
    }),
  ).toThrow(SoundPrintRefusedError)
})
