import { expect, test } from 'bun:test'
import { measureAttributeIssues } from './measure-attributes.ts'

test('accepts every measured property kind and a custom property target', () => {
  for (const measure of ['max-content-inline:children', 'block', 'line-count']) {
    expect(measureAttributeIssues('chapter <p>', { 'data-measure': measure, 'data-measure-as': '--widest_word' })).toEqual([])
  }
})

test('refuses an unknown measure, a missing pair and a non-custom property target', () => {
  expect(measureAttributeIssues('chapter <p>', { 'data-measure': 'width', 'data-measure-as': 'widest' })).toEqual([
    'chapter <p> data-measure "width" is invalid; use max-content-inline:children, block or line-count to clear this refusal',
    'chapter <p> data-measure-as "widest" is invalid; use a CSS custom property name beginning with -- to clear this refusal',
  ])
  expect(measureAttributeIssues('chapter <p>', { 'data-measure-as': '--widest' })[0]).toContain('data-measure "" is invalid')
  expect(measureAttributeIssues('chapter <p>', { 'data-measure': 'block' })[0]).toContain('data-measure-as "" is invalid')
})
