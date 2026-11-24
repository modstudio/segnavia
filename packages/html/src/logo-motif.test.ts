import { describe, expect, test } from 'bun:test'
import { expandLogoMotifs, expandMotifs, MotifRefusedError, motifPlacementRefusals } from './motifs.ts'

const logo = {
  src: 'https://assets.example/primary.svg',
  alt: 'Segnavia',
  lang: 'en',
  versions: {
    reversed: { src: 'data:image/svg+xml,%3Csvg/%3E', alt: 'סגנוויה', lang: 'he' },
    mark: { src: 'https://assets.example/mark.svg' },
  },
}

describe('library logo motif', () => {
  test('replaces children with an image and keeps placement attributes', () => {
    expect(expandLogoMotifs('<header class="masthead" data-motif="segnavia:logo"><b>old</b></header>', logo)).toBe(
      '<header class="masthead" data-motif="segnavia:logo"><img src="https://assets.example/primary.svg" alt="Segnavia" lang="en" dir="ltr"></header>',
    )
  })

  test('selects a version and resolves RTL direction from its alt text', () => {
    expect(expandLogoMotifs('<i data-motif="segnavia:logo" data-motif-version="reversed"></i>', logo)).toContain(
      '<img src="data:image/svg+xml,%3Csvg/%3E" alt="סגנוויה" lang="he" dir="rtl">',
    )
  })

  test('inherits the primary alternative text, language and direction when a version omits alt', () => {
    const hebrew = { ...logo, alt: 'סגנוויה', lang: 'he', dir: 'rtl' as const }
    expect(expandLogoMotifs('<i data-motif="segnavia:logo" data-motif-version="mark"></i>', hebrew)).toContain(
      '<img src="https://assets.example/mark.svg" alt="סגנוויה" lang="he" dir="rtl">',
    )
  })

  test('refuses a missing logo or version with a remedy', () => {
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo"></i>', undefined)).toThrow(MotifRefusedError)
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo"></i>', undefined, 'brand "house"')).toThrow(
      /logo of brand "house".*add a logo to brand "house" or remove the placement/,
    )
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo" data-motif-version="mono"></i>', logo, 'brand "house"')).toThrow(
      /logo version "mono" of brand "house".*add that version to the logo of brand "house" or remove the placement/,
    )
  })

  test('refuses inherited object keys as unknown versions', () => {
    for (const version of ['constructor', 'toString', 'valueOf']) {
      expect(() => expandLogoMotifs(`<i data-motif="segnavia:logo" data-motif-version="${version}"></i>`, logo)).toThrow(
        new RegExp(`logo version "${version}"`),
      )
    }
  })

  test('collects logo refusals during validate-only motif passes', async () => {
    const options = {
      source: { motif: async () => undefined },
      scripts: 'refuse' as const,
      prefix: 'slot',
      signal: new AbortController().signal,
      logoBrand: 'brand "house"',
    }
    expect(await motifPlacementRefusals('<i data-motif="segnavia:logo"></i>', options)).toEqual([expect.stringContaining('the logo of brand "house"')])
    expect(await motifPlacementRefusals('<i data-motif="segnavia:logo" data-motif-version="missing"></i>', { ...options, logo })).toEqual([
      expect.stringContaining('logo version "missing" of brand "house"'),
    ])
    await expect(expandMotifs('<i data-motif="segnavia:logo"></i>', options)).rejects.toBeInstanceOf(MotifRefusedError)
  })

  test('returns markup without a logo placement byte-for-byte unchanged', () => {
    const html = '<SVG viewBox="0 0 1 1"/><p data-note="segnavia:logo">A&nbsp;B</p>'
    expect(expandLogoMotifs(html, logo)).toBe(html)
  })
})
