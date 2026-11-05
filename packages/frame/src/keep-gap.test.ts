import { describe, expect, test } from 'bun:test'
import { keepGap } from './keep-gap.ts'

describe('keepGap', () => {
  test('collapses whitespace to one non-breaking space in either direction', () => {
    for (const gap of [' ', '   ', [' ', '\t'].join('')]) expect(keepGap(gap, 'normal')).toBe('\u00a0')
  })

  test('preserves the amount of whitespace while removing its break opportunities', () => {
    expect(keepGap('   ', 'pre')).toBe('\u00a0\u00a0\u00a0')
    expect(keepGap([' ', '  '].join(''), 'pre-wrap')).toBe('\u00a0\u00a0\u00a0')
    expect(keepGap(' \t', 'break-spaces')).toBe('\u00a0\u00a0')
  })

  test('uses a word joiner when adjacent content has no whitespace gap', () => {
    expect(keepGap('', 'normal')).toBe('\u2060')
    expect(keepGap('', 'pre')).toBe('\u2060')
  })
})
