import { expect, test } from 'bun:test'
import { StyleSheet } from '@segnavia/format'
import { frameStyleSheets } from '@segnavia/frame/bridge'
import { continuousBookNeedsScripts, usesKeepWith } from './book-render.ts'

test('enables the continuous print bridge only when markup or a stylesheet declares a keep', () => {
  expect(usesKeepWith('<span style="--segnavia-keep-with:next">1</span> word')).toBe(true)
  expect(usesKeepWith('<p><span class="seif">1</span> word</p>', '.seif{--segnavia-keep-with:next}')).toBe(true)
  expect(usesKeepWith('<p>ordinary book text</p>', undefined, 'p{margin:0}')).toBe(false)
})

test('typed paragraph keeps enable scripts for continuous books', () => {
  const kept = frameStyleSheets(StyleSheet.parse({ textStyles: { heading: { kind: 'paragraph', keepWithNext: true } } }))
  expect(continuousBookNeedsScripts('<p class="segnavia-style-heading">Heading</p>', kept, undefined, 'refuse', false)).toBe(true)
  expect(continuousBookNeedsScripts('<p>Ordinary</p>', frameStyleSheets(undefined), undefined, 'refuse', false)).toBe(false)
})
