import { expect, test } from 'bun:test'
import { fontRows, pointedLines, text } from './hebrew-text.ts'

test('shares normalized pointed text and pdffonts row extraction', () => {
  expect(text('  אָ\nב  ')).toBe('אָ ב')
  expect(pointedLines('<p data-pointed>  אָ\nב  </p><p>ignored</p>')).toEqual(['אָ ב'])
  expect(fontRows('name type\n---- ----\n  Alef True  \n\n')).toEqual(['Alef True'])
})
