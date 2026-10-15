import { describe, expect, test } from 'bun:test'
import { SINGLE_PAGE_PRINT_CSS } from './print-css.ts'

describe('single-page print CSS', () => {
  test('clips paint at the root while keeping a short page tall enough to paint absolute content', () => {
    expect(SINGLE_PAGE_PRINT_CSS).toBe(':where(:root){contain:paint;min-height:100%}')
  })
})
