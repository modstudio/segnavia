import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { plainText, RunText } from './text-run.ts'

test('plainText preserves strings and joins runs without separators', () => {
  expect(plainText('פרק Genesis')).toBe('פרק Genesis')
  expect(plainText([{ text: 'פרק ' }, { text: 'Genesis', lang: 'en' }])).toBe('פרק Genesis')
})

test('RunText refuses empty and open run values', () => {
  expect(RunText.safeParse([]).success).toBeFalse()
  expect(RunText.safeParse([{ text: '' }]).success).toBeFalse()
  expect(RunText.safeParse([{ text: 'Chapter', extra: true }]).success).toBeFalse()
})

test('Document reports the run field that could not be parsed', () => {
  const input = (contentsLabel: unknown) => ({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    children: [{ type: 'section', title: 'Chapter', contentsLabel, children: [{ type: 'flow', html: '<p>Text</p>' }] }],
  })
  for (const value of [[], [{ text: '' }], [{ text: 'Chapter', extra: true }]]) {
    expect(() => Document.parse(input(value))).toThrow(/contentsLabel/)
  }
})
