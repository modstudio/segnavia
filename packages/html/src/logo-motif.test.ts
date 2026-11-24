import { describe, expect, test } from 'bun:test'
import { expandLogoMotifs, MotifRefusedError } from './motifs.ts'

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

  test('inherits only the primary alternative text when a version omits it', () => {
    expect(expandLogoMotifs('<i data-motif="segnavia:logo" data-motif-version="mark"></i>', logo)).toContain(
      '<img src="https://assets.example/mark.svg" alt="Segnavia" dir="ltr">',
    )
  })

  test('refuses a missing logo or version with a remedy', () => {
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo"></i>', undefined)).toThrow(MotifRefusedError)
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo"></i>', undefined)).toThrow(/brand logo.*add a logo to the brand or remove the placement/)
    expect(() => expandLogoMotifs('<i data-motif="segnavia:logo" data-motif-version="mono"></i>', logo)).toThrow(
      /brand logo version "mono".*add that version to the brand logo or remove the placement/,
    )
  })
})
