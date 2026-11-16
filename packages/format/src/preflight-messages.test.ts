import { expect, test } from 'bun:test'
import { cssVarInvalidMessage, hjViolationMessage } from './preflight-messages.ts'

test('library font custom properties name the style.fonts declaration that clears the issue', () => {
  expect(cssVarInvalidMessage('--segnavia-font-heading')).toBe(
    'Custom property --segnavia-font-heading is invalid; declare font heading in style.fonts and supply it from the font source to clear it.',
  )
  expect(cssVarInvalidMessage('--brand-color')).toBe('Custom property --brand-color is invalid; define it or add a var() fallback to clear it.')
})

test('H&J violation messages distinguish finite and unsettable lines', () => {
  expect(hjViolationMessage(140, 80, 133, 1.21)).toBe(
    'The worst line uses 140% word spacing, outside the 80%–133% limits (adjustment ratio 1.21). Widen the measure, allow hyphenation, widen the word-spacing limits, or edit the text to clear this violation.',
  )
  expect(hjViolationMessage(Number.NEGATIVE_INFINITY, 80, 133, Number.NEGATIVE_INFINITY)).toContain(
    'overfull even at the 80% minimum word spacing; no word spacing can set it',
  )
  expect(hjViolationMessage(Number.POSITIVE_INFINITY, 80, 133, Number.POSITIVE_INFINITY)).toContain(
    'too short and has no space to stretch within the 80%–133% word-spacing limits; no word spacing can set it',
  )
})
