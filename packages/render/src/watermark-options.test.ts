import { expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { parseWatermark, watermarkPageNumbers } from './watermark-options.ts'

test.each([
  [{ text: 'Draft', image: 'data:image/png;base64,' }, 'exactly one'],
  [{ opacity: 0.5 }, 'exactly one'],
  [{ text: 3 }, 'text'],
  [{ text: 'Draft', opacity: 0 }, 'opacity'],
  [{ text: 'Draft', opacity: 1.1 }, 'opacity'],
  [{ text: 'Draft', size: Number.NaN }, 'size'],
  [{ text: 'Draft', rotation: Number.POSITIVE_INFINITY }, 'rotation'],
  [{ text: 'Draft', pages: [0] }, 'pages'],
  [{ text: 'Draft', pages: [1.5] }, 'pages'],
  [{ text: 'Draft', font: 'Body, ' }, 'font'],
  [{ text: 'Draft', font: '"Foo, Bar", serif' }, 'give family names without quotes; they are quoted for you'],
] as const)('refuses invalid watermark options %#', (input, message) => {
  expect(() => parseWatermark(input)).toThrow(message)
})

test('parses a watermark without changing its public option names', () => {
  expect(
    parseWatermark({
      text: 'Draft',
      lang: 'en',
      dir: 'ltr',
      font: 'Body',
      color: '#888',
      opacity: 0.2,
      rotation: 'diagonal',
      size: 0.7,
      position: { inline: 'end', block: 'start' },
      pages: [2, 4],
    }),
  ).toEqual({
    text: 'Draft',
    lang: 'en',
    dir: 'ltr',
    font: 'Body',
    color: '#888',
    opacity: 0.2,
    rotation: 'diagonal',
    size: 0.7,
    position: { inline: 'end', block: 'start' },
    pages: [2, 4],
  })
})

test('refuses unknown nested watermark options with the render call path', () => {
  expect(() => parseWatermark({ text: 'Draft', position: { inline: 'start', extra: true } }, 'pagePdf')).toThrow(
    'pagePdf options.watermark.position.extra: unknown option "extra"; remove it to clear this refusal',
  )
})

test('refuses a selected physical page beyond the laid-out page count', () => {
  expect(() => watermarkPageNumbers({ text: 'Draft', pages: [4] }, 3)).toThrow(
    new RenderRefusedError('The watermark selects physical page 4, but the laid-out output has 3 pages; select a page from 1 through 3 to clear this refusal.'),
  )
})
