import { expect, test } from 'bun:test'
import { cssVarInvalidMessage } from './preflight-messages.ts'

test('library font custom properties name the style.fonts declaration that clears the issue', () => {
  expect(cssVarInvalidMessage('--segnavia-font-heading')).toBe(
    'Custom property --segnavia-font-heading is invalid; declare font heading in style.fonts and supply it from the font source to clear it.',
  )
  expect(cssVarInvalidMessage('--brand-color')).toBe('Custom property --brand-color is invalid; define it or add a var() fallback to clear it.')
})
