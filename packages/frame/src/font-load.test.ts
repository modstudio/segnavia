import { describe, expect, test } from 'bun:test'
import {
  declaredFontLoads,
  FONT_FAILURE_ATTRIBUTE,
  FONT_FAILURE_FIELD_LIMIT,
  FONT_FAILURE_LIMIT,
  fontFailuresAttribute,
  fontFailuresData,
  fontMissingEntries,
  loadDeclaredFonts,
} from './font-load.ts'
import { boundPreflightReport, PREFLIGHT_PRESETS, preflightRefusal } from '@segnavia/format'

describe('font load', () => {
  test('turns a missing face into warning and strict refusal text with its distinguishing face', () => {
    const entries = fontMissingEntries([{ font: 'body', family: 'Body', weight: 700, style: 'italic', reason: 'unsupplied' }])
    const facts = { pageCount: 0, pages: [], fits: [] }
    expect(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.default).issues[0]?.subject).toBe('Body (weight 700, italic)')
    expect(preflightRefusal(boundPreflightReport({ entries, facts }, PREFLIGHT_PRESETS.strict))).toBe(
      'Font face Body (weight 700, italic) is missing; supply and load that face to clear it.',
    )
  })

  test('loads each matching face with its range sample and reports missing and errored faces', async () => {
    const samples: string[] = []
    const regular = {
      family: 'Alef',
      weight: 'normal',
      style: 'normal',
      unicodeRange: 'U+0-10FFFF',
      status: 'loaded',
      load: async (sample?: string) => samples.push(sample ?? ''),
    }
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

  test('loads the matching face when weight and style are shared across ranges', async () => {
    const loaded: string[] = []
    const face = (unicodeRange: string) => ({
      family: 'Body',
      weight: 'normal',
      style: 'normal',
      unicodeRange,
      status: 'loaded',
      load: async (sample?: string) => loaded.push(`${unicodeRange}:${sample}`),
    })
    const failures = await loadDeclaredFonts(
      [
        { font: 'body', unicodeRange: 'U+0590-05FF', sample: 'א' },
        { font: 'body', unicodeRange: 'U+0000-007F', sample: 'A' },
      ],
      [face('U+0000-007F'), face('U+0590-05FF')],
      { setAttribute: () => {} },
      () => 'Body',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loaded).toEqual(['U+0590-05FF:א', 'U+0000-007F:A'])
    expect(failures).toEqual([])
  })

  test('treats Chromium full-range faces as unbounded', async () => {
    let loads = 0
    const failures = await loadDeclaredFonts(
      declaredFontLoads({ hebrew: { faces: [{ script: 'hebrew' }] } }),
      [{ family: 'Hebrew', weight: '400', style: 'normal', unicodeRange: 'U+0-10FFFF', status: 'loaded', load: async () => loads++ }],
      { setAttribute: () => {} },
      () => 'Hebrew',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loads).toBe(1)
    expect(failures).toEqual([])
  })

  test('matches Chromium-normalized ranges by value', async () => {
    let loads = 0
    const failures = await loadDeclaredFonts(
      declaredFontLoads({ hebrew: { faces: [{ script: 'hebrew' }] } }),
      [
        {
          family: 'Hebrew',
          weight: '400',
          style: 'normal',
          unicodeRange: 'U+590-5FF, U+FB1D-FB4F',
          status: 'loaded',
          load: async () => loads++,
        },
      ],
      { setAttribute: () => {} },
      () => 'Hebrew',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loads).toBe(1)
    expect(failures).toEqual([])
  })

  test('does not match a different Chromium-reported range', async () => {
    let loads = 0
    const failures = await loadDeclaredFonts(
      declaredFontLoads({ hebrew: { faces: [{ script: 'hebrew' }] } }),
      [{ family: 'Hebrew', weight: '400', style: 'normal', unicodeRange: 'U+0-7F', status: 'loaded', load: async () => loads++ }],
      { setAttribute: () => {} },
      () => 'Hebrew',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loads).toBe(0)
    expect(failures).toEqual([{ font: 'hebrew', family: 'Hebrew', unicodeRange: 'U+0590-05FF,U+FB1D-FB4F', reason: 'unloaded' }])
  })
})
