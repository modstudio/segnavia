import { expect, test } from 'bun:test'
import { identifyHtmlBlocks } from './block-identify.ts'
import { FIT_ATTRIBUTE_FAMILY } from './fit-attributes.ts'
import { MEASURE_ATTRIBUTE_FAMILY, measureAttributeIssues } from './measure-attributes.ts'
import { parse } from './sanitize.ts'
import { sourceAttributeIssues } from './source-attributes.ts'

test('accepts every measured property kind and a custom property target', () => {
  for (const measure of ['max-content-inline:children', 'block', 'line-count']) {
    expect(measureAttributeIssues('chapter <p>', { 'data-measure': measure, 'data-measure-as': '--widest_word' })).toEqual([])
  }
})

test('refuses an unknown measure, a missing pair and a non-custom property target', () => {
  expect(measureAttributeIssues('chapter <p>', { 'data-measure': 'width', 'data-measure-as': 'widest' })).toEqual([
    'chapter <p> data-measure "width" is invalid; use max-content-inline:children, block, line-count to clear this refusal',
    'chapter <p> data-measure-as "widest" is invalid; use a CSS custom property name beginning with -- to clear this refusal',
  ])
  expect(measureAttributeIssues('chapter <p>', { 'data-measure-as': '--widest' })[0]).toContain('data-measure "" is invalid')
  expect(measureAttributeIssues('chapter <p>', { 'data-measure': 'block' })[0]).toContain('data-measure-as "" is invalid')
})

test('the shared attribute walk requires a block subject and accepts an inline source inside one', () => {
  const families = [FIT_ATTRIBUTE_FAMILY, MEASURE_ATTRIBUTE_FAMILY]
  expect(sourceAttributeIssues(parse('<em data-measure="block" data-measure-as="--x">x</em>').children, 'chapter', families)).toContain(
    'chapter <em> data-measure has no block subject; place it in a block element to clear this refusal',
  )
  expect(sourceAttributeIssues(parse('<p>a <em data-measure="block" data-measure-as="--x">b</em></p>').children, 'chapter', families)).toEqual([])
})

test('the documented block-kind measured-property example parses and receives an id', () => {
  const parsed = identifyHtmlBlocks(
    '<figure data-measure="max-content-inline:children" data-measure-as="--widest"><span>short</span><span>longest</span></figure>',
    'documented example',
    () => 'measured-example',
    new Map(),
  )
  expect(parsed.html).toContain('data-segnavia-id="measured-example"')
})

test('parent-page regions refuse measured properties that cannot be copied from a source', () => {
  expect(() =>
    identifyHtmlBlocks('<p data-measure="block" data-measure-as="--height">Furniture</p>', 'parent page', () => 'furniture', new Map(), {
      parentRegion: true,
    }),
  ).toThrow('data-measure cannot take effect in a parent-page region')
})

test('line numbers require a block, their document setting, and stay out of parent-page regions', () => {
  expect(() => identifyHtmlBlocks('<p data-line-numbers>Text</p>', 'chapter', () => 'line', new Map(), { lineNumbers: 'unset' })).toThrow(
    'settings.lineNumbers setting',
  )
  expect(() => identifyHtmlBlocks('<p><em data-line-numbers>Text</em></p>', 'chapter', () => 'line', new Map(), { lineNumbers: 'set' })).toThrow(
    'move it to the containing top-level <p>',
  )
  expect(() =>
    identifyHtmlBlocks('<p data-line-numbers>Text</p>', 'parent page', () => 'line', new Map(), {
      parentRegion: true,
      lineNumbers: 'set',
    }),
  ).toThrow('cannot take effect in a parent-page region')
  expect(identifyHtmlBlocks('<section data-line-numbers><p>Text</p></section>', 'chapter', () => 'line', new Map(), { lineNumbers: 'set' }).html).toContain(
    'data-line-numbers',
  )
  expect(() => identifyHtmlBlocks('<ul><li data-line-numbers>Text</li></ul>', 'chapter', () => 'line', new Map(), { lineNumbers: 'set' })).toThrow(
    'move it to the containing top-level <ul>',
  )
  expect(() => identifyHtmlBlocks('<p data-line-numbers>Text</p>', 'slide', () => 'line', new Map(), { lineNumbers: 'unsupported' })).toThrow(
    'use a book or printed document',
  )
})
