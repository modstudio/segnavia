import { expect, test } from 'bun:test'
import { watermarkMarkup, watermarkRotation, type WatermarkPage } from './watermark-markup.ts'

const page = (width: number, height: number, direction: 'ltr' | 'rtl' = 'ltr'): WatermarkPage => ({
  media: { width, height },
  trim: { x: 0, y: 0, width, height },
  direction,
})

test('the default rotation follows A4 and letter diagonals', () => {
  expect(watermarkRotation({ text: 'Draft' }, page(210, 297))).toBeCloseTo(54.73699, 5)
  expect(watermarkRotation({ text: 'Draft' }, page(612, 792))).toBeCloseTo(52.30576, 5)
})

test('rtl text mirrors the page diagonal', () => {
  expect(watermarkRotation({ text: 'טיוטה', dir: 'rtl' }, page(210, 297))).toBeCloseTo(-54.73699, 5)
})

test.each([
  ['start', 'flex-start'],
  ['center', 'center'],
  ['end', 'flex-end'],
] as const)('size and logical %s positions are computed on both axes', (position, css) => {
  const markup = watermarkMarkup(
    { text: 'Draft', size: 0.25, position: { inline: position, block: position } },
    { media: { width: 240, height: 340 }, trim: { x: 10, y: 20, width: 200, height: 300 }, direction: 'ltr' },
  )
  expect(markup).toContain('inline-size:50pt')
  expect(markup).toContain(`justify-content:${css}`)
  expect(markup).toContain(`align-items:${css}`)
  expect(markup).toContain('left:10pt;top:20pt;width:200pt;height:300pt')
})

test('text is escaped and isolated in its resolved direction', () => {
  const markup = watermarkMarkup({ text: '<טיוטה>', lang: 'he' }, page(210, 297, 'rtl'))
  expect(markup).toContain('<bdi dir="rtl" lang="he">&lt;טיוטה&gt;</bdi>')
})
