import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { pageViewport } from './page-viewport.ts'

test('a print page keeps its sheet height', () => {
  expect(pageViewport(Page.parse({ html: '', print: { paper: 'letter' } })).grows).toBe(false)
})

test.each([
  ['legacy fluid', 'fluid'],
  ['auto-height', { width: 320, height: 'auto' }],
] as const)('a %s page without print grows', (_name, size) => {
  expect(pageViewport(Page.parse({ html: '', size })).grows).toBe(true)
})

test.each([
  ['full', 1024],
  ['standard', 1024],
  ['wide', 1440],
  [600, 600],
] as const)('a %s flowing page renders at its viewport width', (width, expected) => {
  expect(pageViewport(Page.parse({ html: '', size: { width, height: 'auto' } })).width).toBe(expected)
})

test('named and full viewport widths honor overrides', () => {
  expect(pageViewport(Page.parse({ html: '', size: { width: 'full', height: 'auto' } }), undefined, { standard: 900 }).width).toBe(900)
  expect(pageViewport(Page.parse({ html: '', size: { width: 'wide', height: 'auto' } }), undefined, { wide: 1200 }).width).toBe(1200)
})

test('an explicit image width remains the viewport width', () => {
  expect(pageViewport(Page.parse({ html: '', size: { width: 'wide', height: 'auto' } }), 700, { wide: 1200 }).width).toBe(700)
})
