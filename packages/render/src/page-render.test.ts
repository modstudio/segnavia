import { expect, test } from 'bun:test'
import { shouldCapturePageFontFacts } from './page-render.ts'

test('captures page font facts only when a watermark is configured', () => {
  expect(shouldCapturePageFontFacts(undefined)).toBe(false)
  expect(shouldCapturePageFontFacts({ text: 'Draft' })).toBe(true)
})
