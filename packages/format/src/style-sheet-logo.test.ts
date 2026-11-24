import { describe, expect, test } from 'bun:test'
import { StyleSheet } from './style-sheet.ts'

describe('brand logo', () => {
  test('parses a logo and host-named versions', () => {
    expect(
      StyleSheet.parse({
        logo: {
          src: 'https://assets.example/logo.svg',
          alt: 'House',
          lang: 'en',
          versions: { 'mark-mono': { src: 'data:image/svg+xml,%3Csvg/%3E', dir: 'ltr' } },
        },
      }).logo,
    ).toEqual({
      src: 'https://assets.example/logo.svg',
      alt: 'House',
      lang: 'en',
      versions: { 'mark-mono': { src: 'data:image/svg+xml,%3Csvg/%3E', dir: 'ltr' } },
    })
  })

  test.each(['logo.svg', 'javascript:alert(1)', 'http://assets.example/logo.svg', 'data:text/html,logo'])('refuses unsafe source %s', (src) => {
    expect(() => StyleSheet.parse({ logo: { src, alt: 'House' } })).toThrow(/logo src must be a safe data:image\/ or an absolute https URL/)
  })

  test('refuses an invalid version name', () => {
    expect(() =>
      StyleSheet.parse({
        logo: { src: 'https://assets.example/logo.svg', alt: 'House', versions: { 'Mark Mono': { src: 'https://assets.example/mono.svg' } } },
      }),
    ).toThrow(/names must start with a lowercase letter/)
  })
})
