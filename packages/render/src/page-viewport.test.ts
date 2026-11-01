import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { pageViewport } from './page-viewport.ts'

test('a print page keeps its sheet height', () => {
  expect(pageViewport(Page.parse({ html: '', print: { paper: 'letter' } })).grows).toBe(false)
})

test.each([
  ['fluid', 'fluid'],
  ['auto-height', { width: 320, height: 'auto' }],
] as const)('a %s page without print grows', (_name, size) => {
  expect(pageViewport(Page.parse({ html: '', size })).grows).toBe(true)
})
