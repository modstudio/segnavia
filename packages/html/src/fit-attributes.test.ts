import { expect, test } from 'bun:test'
import { fitAttributeIssues } from './fit-attributes.ts'

test('accepts the ordered fit vocabulary and independent strategy bounds', () => {
  expect(
    fitAttributeIssues('chapter <p>', {
      'data-fit': 'leading, size',
      'data-fit-min': '1.1, 12pt',
      'data-fit-max': '1.4, 20pt',
      'data-fit-step': '0.05, 1pt',
      'data-fit-axis': 'both',
      'data-fit-box': 'parent',
      'data-fit-group': 'cards',
    }),
  ).toEqual([])
})

test('refuses mismatched lists, reversed bounds, and unsafe unitless leading at the edge', () => {
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'size, leading', 'data-fit-min': '18pt' })[0]).toContain('has 1 values but data-fit has 2')
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'size', 'data-fit-min': '20pt', 'data-fit-max': '18pt' })[0]).toContain(
    'data-fit-min for size is greater',
  )
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'leading', 'data-fit-min': '0.9' })[0]).toContain('unitless leading "0.9" is under 1.0')
})

test.each([
  ['2em', 'absolute CSS length'],
  ['wide', 'not valid'],
  ['-2pt', 'not valid'],
] as const)('refuses a size minimum of %s', (value, message) => {
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'size', 'data-fit-min': value })[0]).toContain(message)
})

test('refuses non-positive steps and unitless tracking', () => {
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'size', 'data-fit-step': '0pt' })[0]).toContain('not valid')
  expect(fitAttributeIssues('chapter <p>', { 'data-fit': 'tracking', 'data-fit-min': '-0.2' })[0]).toContain('needs an absolute CSS unit')
})
