import { describe, expect, test } from 'bun:test'
import { Book } from './index.ts'

const input = (overrides: Record<string, unknown> = {}) => ({
  title: 'Book',
  mode: 'continuous',
  chapters: [{ title: 'Chapter', html: '<p>Text</p>' }],
  ...overrides,
})

describe('book fragmentation', () => {
  test('defaults to safe, accepts none and refuses other values', () => {
    expect(Book.parse(input()).fragmentation).toBe('safe')
    expect(Book.parse(input({ fragmentation: 'none' })).fragmentation).toBe('none')
    expect(Book.safeParse(input({ fragmentation: 'always' as never })).success).toBe(false)
  })
})
