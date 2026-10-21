import { describe, expect, test } from 'bun:test'
import { parseVerifyShard, sectionsForShard } from './verify-demo-shards.ts'

const sections = Array.from({ length: 18 }, (_, index) => `section-${index + 1}`)

describe('demo verification shards', () => {
  test('every section belongs to exactly one shard for any shard count', () => {
    for (let count = 1; count <= sections.length + 2; count++) {
      const assigned = Array.from({ length: count }, (_, index) =>
        Array.from(sectionsForShard(sections, { index: index + 1, count })),
      ).flat()
      expect(assigned.toSorted()).toEqual(sections.toSorted())
    }
  })

  test('an unset shard selects every section', () => {
    expect(Array.from(sectionsForShard(sections, parseVerifyShard(undefined)))).toEqual(sections)
  })

  test('the shard is one-based and bounded by its count', () => {
    expect(parseVerifyShard('2/3')).toEqual({ index: 2, count: 3 })
    for (const value of ['0/3', '4/3', '1/0', 'one/three', '1/2/3']) {
      expect(() => parseVerifyShard(value)).toThrow('SEGNAVIA_VERIFY_SHARD')
    }
  })
})
