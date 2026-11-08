import { describe, expect, test } from 'bun:test'
import { StyleSheet } from './style-sheet.ts'

function refusal(input: unknown): string {
  const result = StyleSheet.safeParse(input)
  expect(result.success).toBe(false)
  return result.success ? '' : result.error.toString()
}

describe('StyleSheet', () => {
  test('refuses unknown keys at every style-owned level', () => {
    for (const input of [{ stray: true }, { tokens: { stray: true } }, { textStyles: { body: { kind: 'paragraph', stray: true } } }]) {
      const styleMessage = refusal(input)
      expect(styleMessage).toContain('stray')
    }
  })

  test('enforces names on keyed sections, basedOn and token references', () => {
    expect(refusal({ tokens: { colors: { Bad: '#fff' } } })).toMatch(/"tokens"[\s\S]*"colors"[\s\S]*"Bad"/)
    expect(refusal({ textStyles: { body: { kind: 'paragraph', basedOn: 'Bad' } } })).toMatch(/"textStyles"[\s\S]*"body"[\s\S]*"basedOn"/)
    expect(refusal({ textStyles: { body: { kind: 'paragraph', color: { token: 'Bad' } } } })).toMatch(/"textStyles"[\s\S]*"body"[\s\S]*"color"[\s\S]*"token"/)
  })

  test('uses the property table to refuse paragraph properties on character styles', () => {
    const message = refusal({ textStyles: { emphasis: { kind: 'character', spaceBefore: { value: 2, unit: 'pt' } } } })
    expect(message).toMatch(/"textStyles"[\s\S]*"emphasis"[\s\S]*"spaceBefore"/)
    expect(message).toContain('remove spaceBefore or change kind to paragraph to clear this refusal')
  })

  test('accepts page geometry columns and refuses duplicate motif keys', () => {
    expect(
      StyleSheet.safeParse({
        pageGeometries: {
          main: {
            paper: 'a4',
            orientation: 'portrait',
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 12, inlineEnd: 12 },
            columns: { count: 2, gap: 4 },
          },
        },
      }).success,
    ).toBe(true)
    const motif = { key: 'folio', revision: '1', label: 'Folio', fields: [], versions: [{ lang: 'en', html: '<span>1</span>' }] }
    const message = refusal({ motifs: [motif, motif] })
    expect(message).toMatch(/"motifs"[\s\S]*1[\s\S]*"key"/)
    expect(message).toContain('give every motif a unique key to clear this refusal')
  })
})
