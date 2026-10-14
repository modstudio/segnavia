import { describe, expect, test } from 'bun:test'
import { sameContent } from './content-value.ts'

describe('resolved content values', () => {
  test('matches equal values rather than object identity', () => {
    expect(sameContent({ kind: 'html', html: '<p>same</p>' }, { html: '<p>same</p>', kind: 'html' })).toBe(true)
    expect(sameContent({ kind: 'html', html: '<p>before</p>' }, { kind: 'html', html: '<p>after</p>' })).toBe(false)
  })
})
