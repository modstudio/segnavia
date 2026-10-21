import { describe, expect, test } from 'bun:test'
import { parseVerifyShard, sectionsForShard, unlistedSections, VERIFY_DEMO_SECTIONS_BY_DURATION } from './verify-demo-shards.ts'

const sections = VERIFY_DEMO_SECTIONS_BY_DURATION

describe('demo verification shards', () => {
  test('every section belongs to exactly one shard for any shard count', () => {
    for (let count = 1; count <= sections.length; count++) {
      const assigned = Array.from({ length: count }, (_, index) => Array.from(sectionsForShard(sections, { index: index + 1, count }))).flat()
      expect(assigned.sort()).toEqual([...sections].sort())
    }
  })

  test('an unset shard selects every section', () => {
    expect(Array.from(sectionsForShard(sections, parseVerifyShard(undefined)))).toEqual([...sections])
  })

  test('the shard is one-based and bounded by its count', () => {
    expect(parseVerifyShard('2/3')).toEqual({ index: 2, count: 3 })
    for (const value of ['0/3', '4/3', '1/0', 'one/three', '1/2/3', `1/${sections.length + 1}`]) {
      expect(() => parseVerifyShard(value)).toThrow('SEGNAVIA_VERIFY_SHARD')
    }
  })

  test('a section left off the duration list, or a listed name with no section, is reported', () => {
    expect(unlistedSections(['verifyPlayer', 'verifyNew'], ['verifyPlayer', 'verifyOld'])).toEqual({ unlisted: ['verifyNew'], stale: ['verifyOld'] })
    expect(unlistedSections(['verifyPlayer'], ['verifyPlayer'])).toEqual({ unlisted: [], stale: [] })
  })
})
