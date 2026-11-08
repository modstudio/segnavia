import { describe, expect, test } from 'bun:test'
import {
  declaredFontLoads,
  FONT_FAILURE_ATTRIBUTE,
  FONT_FAILURE_FIELD_LIMIT,
  FONT_FAILURE_LIMIT,
  fontFailuresAttribute,
  fontFailuresData,
  loadDeclaredFonts,
} from './font-load.ts'

describe('font load', () => {
  test('loads each matching face with its range sample and reports missing and errored faces', async () => {
    const samples: string[] = []
    const regular = { family: 'Alef', weight: 'normal', style: 'normal', status: 'loaded', load: async (sample?: string) => samples.push(sample ?? '') }
    const errored = { family: 'Alef', weight: '700', style: 'normal', status: 'error', load: async () => undefined }
    const attributes = new Map<string, string>()
    const failures = await loadDeclaredFonts(
      declaredFontLoads({ alef: { faces: [{ script: 'hebrew' }, { weight: 700 }, { style: 'italic' }] } }),
      [regular, errored],
      { setAttribute: (name, value) => attributes.set(name, value) },
      () => 'Alef',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(samples[0]).toMatch(/[\u0591-\u05af]/)
    expect(failures).toEqual([
      { font: 'alef', family: 'Alef', weight: 700, reason: 'unloaded' },
      { font: 'alef', family: 'Alef', style: 'italic', reason: 'unloaded' },
    ])
    expect(fontFailuresAttribute(attributes.get(FONT_FAILURE_ATTRIBUTE) ?? null)).toEqual(failures)
  })

  test('rejects malformed and oversized reports whole', () => {
    const valid = { font: 'body', family: 'Body', reason: 'unloaded' as const }
    expect(fontFailuresData([valid])).toEqual([valid])
    expect(fontFailuresData([valid, { ...valid, reason: 'other' }])).toBeNull()
    expect(fontFailuresData([{ ...valid, family: 'x'.repeat(257) }])).toBeNull()
    expect(fontFailuresData(Array.from({ length: 65 }, () => valid))).toBeNull()
    expect(fontFailuresData([{ ...valid, extra: 'removed' }])).toEqual([valid])
  })

  test('attempts every declaration while bounding the report', async () => {
    let loads = 0
    const faces = Array.from({ length: 65 }, (_, index) => ({
      family: `Family ${index}`,
      weight: 'normal',
      style: 'normal',
      status: 'error',
      load: async () => {
        loads++
      },
    }))
    const failures = await loadDeclaredFonts(
      faces.map((_, index) => ({ font: `font-${index}`, sample: 'a' })),
      faces,
      { setAttribute: () => {} },
      (font) => `Family ${font.slice(5)}`,
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loads).toBe(65)
    expect(failures).toHaveLength(64)
  })
})
