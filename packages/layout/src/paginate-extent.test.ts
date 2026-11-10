import { expect, test } from 'bun:test'
import { lineExtent } from './paginate-extent.ts'

test('a line extent includes opening and closing decoration', () => {
  expect(lineExtent({ top: 10, bottom: 20, decorationTop: -6, decorationBottom: 28 })).toEqual({ start: -6, end: 28 })
})

test('a line extent without decoration is its line box', () => {
  expect(lineExtent({ top: 10, bottom: 20 })).toEqual({ start: 10, end: 20 })
})
