import { expect, test } from 'bun:test'
import { ENGLISH_LABELS } from './labels.ts'
import { slideSettings } from './slide-settings.ts'

const settings = slideSettings(ENGLISH_LABELS, () => {})
const printFrame = settings[0]
const htmlSlide = { id: 'html', content: { kind: 'html' as const, html: '<p>Slide</p>' } }

test('print frame applies only to animated HTML slides', () => {
  expect(printFrame?.appliesTo(htmlSlide, { animated: true, lengthMs: 1200 })).toBe(true)
  expect(printFrame?.appliesTo(htmlSlide, { animated: false, lengthMs: null })).toBe(false)
  expect(printFrame?.appliesTo({ id: 'image', content: { kind: 'image', src: 'slide.png', alt: '' } }, { animated: true, lengthMs: 1200 })).toBe(false)
})

test('print frame labels its current value', () => {
  expect(printFrame?.valueLabel(htmlSlide)).toBe('Start')
  expect(printFrame?.valueLabel({ ...htmlSlide, printAtMs: 1200 })).toBe('1.2 s')
})
