import { expect, test } from 'bun:test'
import { highestTextBaseline, setPointAtPageStart } from './pdfjs-browser.ts'

test('a set point starts the page when no text baseline is above its destination', () => {
  expect(setPointAtPageStart(null, 500)).toBe(true)
  expect(setPointAtPageStart(499, 500)).toBe(true)
  expect(setPointAtPageStart(500, 500)).toBe(true)
  expect(setPointAtPageStart(501, 500)).toBe(false)
})

test('the highest text baseline excludes hidden target-link text', () => {
  expect(
    highestTextBaseline([
      { text: '\u200b', y: 590 },
      { text: '  ', y: 580 },
      { text: 'Book text', y: 520 },
      { text: 'More book text', y: 480 },
    ]),
  ).toBe(520)
  expect(highestTextBaseline([{ text: '\u200b', y: 590 }])).toBeNull()
})
