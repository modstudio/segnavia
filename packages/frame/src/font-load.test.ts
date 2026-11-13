import { describe, expect, test } from 'bun:test'
import { fontCoverageGaps, matchFaces } from '@segnavia/format'
import {
  declaredFontLoadExpression,
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
      { font: 'alef', family: 'Alef', weight: 400, style: 'italic', reason: 'unloaded' },
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
    expect(fontFailuresData([{ ...valid, weight: [100, 900] }])).toEqual([{ ...valid, weight: [100, 900] }])
    for (const weight of [
      [100, 400, 900],
      [100.5, 900],
      [0, 900],
      [900, 100],
    ])
      expect(fontFailuresData([{ ...valid, weight }])).toBeNull()
  })

  test('loads a variable face only when it covers the declared range', async () => {
    let loads = 0
    const variable = { family: 'Body', weight: '100 900', style: 'normal', status: 'loaded', load: async () => loads++ }
    const failures = await loadDeclaredFonts(
      declaredFontLoads({ body: { faces: [{ weight: [300, 700] }, { weight: [100, 1000] }] } }),
      [variable],
      { setAttribute: () => {} },
      () => 'Body',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(loads).toBe(2)
    expect(failures).toEqual([{ font: 'body', family: 'Body', weight: [901, 1000], reason: 'unloaded' }])
  })

  test('embeds the self-contained coverage helper in the declared font expression', async () => {
    const compile = (declarations: string) =>
      new Function('document', 'getComputedStyle', `return ${declaredFontLoadExpression(declarations)}`) as (
        document: { fonts: unknown[]; documentElement: { setAttribute(): void } },
        getComputedStyle: () => { getPropertyValue(): string },
      ) => Promise<unknown>
    expect(await compile('[]')({ fonts: [], documentElement: { setAttribute: () => {} } }, () => ({ getPropertyValue: () => '' }))).toEqual([])
    const declarations = JSON.stringify([{ font: 'body', weight: [300, 700], sample: 'A' }])
    const failures = await compile(declarations)(
      {
        fonts: [{ family: 'Body', weight: '100 900', style: 'normal', status: 'loaded', load: async () => undefined }],
        documentElement: { setAttribute: () => {} },
      },
      () => ({ getPropertyValue: () => 'Body' }),
    )
    expect(failures).toEqual([])
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
    expect(failures).toEqual([{ font: 'hebrew', family: 'Hebrew', weight: 400, unicodeRange: 'U+0590-05FF,U+FB1D-FB4F', reason: 'unloaded' }])
  })

  test('uses the same coverage table as the resolver and opens a failed face gap', async () => {
    const cases = [
      {
        declaration: { weight: [100, 900] as [number, number], unicodeRange: 'U+0000-05FF' },
        faces: [
          { weight: '100 500', unicodeRange: 'U+0000-00FF' },
          { weight: '100 500', unicodeRange: 'U+0100-05FF' },
          { weight: '501 900', unicodeRange: 'U+0000-05FF' },
        ],
      },
      {
        declaration: { weight: [100, 900] as [number, number] },
        faces: [{ weight: '100' }, { weight: '900' }],
      },
    ]
    for (const [caseIndex, coverageCase] of cases.entries()) {
      const sourceFaces = coverageCase.faces.map((face) => ({
        family: 'Body',
        data: new Uint8Array(),
        format: 'truetype' as const,
        ...face,
      }))
      const expected = fontCoverageGaps(coverageCase.declaration, coverageCase.faces)
      expect(matchFaces([coverageCase.declaration], sourceFaces).unsupplied).toEqual(expected)
      const failures = await loadDeclaredFonts(
        [{ font: 'body', ...coverageCase.declaration, sample: 'A' }],
        coverageCase.faces.map((face) => ({ family: 'Body', style: 'normal', status: 'loaded', load: async () => undefined, ...face })),
        { setAttribute: () => {} },
        () => 'Body',
        FONT_FAILURE_ATTRIBUTE,
        FONT_FAILURE_LIMIT,
        FONT_FAILURE_FIELD_LIMIT,
      )
      expect(
        failures.map(({ font: _, family: __, reason: ___, ...gap }) => gap),
        `case ${caseIndex}`,
      ).toEqual(expected)
    }

    const failures = await loadDeclaredFonts(
      [{ font: 'body', weight: [100, 900], sample: 'A' }],
      [
        { family: 'Body', weight: '100 500', style: 'normal', status: 'loaded', load: async () => undefined },
        { family: 'Body', weight: '501 900', style: 'normal', status: 'unloaded', load: async () => Promise.reject(new Error('bad font')) },
      ],
      { setAttribute: () => {} },
      () => 'Body',
      FONT_FAILURE_ATTRIBUTE,
      FONT_FAILURE_LIMIT,
      FONT_FAILURE_FIELD_LIMIT,
    )
    expect(failures).toEqual([{ font: 'body', family: 'Body', weight: [501, 900], reason: 'unloaded' }])
  })
})
