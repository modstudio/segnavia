import { describe, expect, test } from 'bun:test'
import { mergeStyleSheets } from './style-merge.ts'
import { StyleSheet } from './style-sheet.ts'

const sheet = (value: unknown) => StyleSheet.parse(value)

function refusal(brand: unknown, document: unknown): string {
  const result = mergeStyleSheets(sheet(brand), sheet(document))
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.refusal
}

describe('mergeStyleSheets', () => {
  test('replaces keyed values whole, preserves origins and unions fonts', () => {
    const result = mergeStyleSheets(
      sheet({
        tokens: { colors: { ink: '#111111', paper: '#ffffff' } },
        textStyles: { body: { kind: 'paragraph', color: '#111111', fontStyle: 'italic' } },
        fonts: [{ app: 'serif' }, { local: 'Held', fallback: 'serif' }],
        css: '.brand{color:red}',
      }),
      sheet({
        tokens: { colors: { ink: '#222222' } },
        textStyles: { body: { kind: 'paragraph', fontWeight: 700 } },
        fonts: [{ local: 'Held', fallback: 'serif' }, { app: 'sans' }],
        css: '.author{color:blue}',
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      sheet: {
        tokens: { colors: { ink: { origin: 'document', value: '#222222' }, paper: { origin: 'brand', value: '#ffffff' } } },
        textStyles: { body: { origin: 'document', value: { fontWeight: 700 } } },
        fonts: [{ app: 'serif' }, { local: 'Held', fallback: 'serif' }, { app: 'sans' }],
        css: { brand: '.brand{color:red}', document: '.author{color:blue}' },
      },
    })
    if (result.ok) expect(result.sheet.textStyles.body?.value).not.toHaveProperty('color')
  })

  test('refuses unknown and cross-kind basedOn with paths and remedies', () => {
    expect(refusal({}, { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } })).toMatch(
      /textStyles\.body\.basedOn.*unknown.*add that text style or remove basedOn.*clear this refusal/,
    )
    expect(refusal({ textStyles: { emphasis: { kind: 'character' } } }, { textStyles: { body: { kind: 'paragraph', basedOn: 'emphasis' } } })).toMatch(
      /textStyles\.body\.basedOn.*character style, not a paragraph style.*same kind.*clear this refusal/,
    )
  })

  test('refuses cycles and chains deeper than eight', () => {
    expect(refusal({}, { textStyles: { a: { kind: 'paragraph', basedOn: 'b' }, b: { kind: 'paragraph', basedOn: 'a' } } })).toMatch(
      /textStyles\.a\.basedOn.*cycle a -> b -> a.*remove a basedOn link.*clear this refusal/,
    )

    const textStyles = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`s${index}`, { kind: 'paragraph', ...(index < 9 ? { basedOn: `s${index + 1}` } : {}) }]),
    )
    expect(refusal({}, { textStyles })).toMatch(/textStyles\.s0\.basedOn.*deeper than 8.*at most 8 links.*clear this refusal/)
  })

  test('refuses a token missing from the property-specific group', () => {
    expect(
      refusal({ tokens: { dimensions: { ink: { value: 1, unit: 'pt' } } } }, { textStyles: { body: { kind: 'paragraph', color: { token: 'ink' } } } }),
    ).toMatch(/textStyles\.body\.color\.token.*unknown in tokens\.colors.*add tokens\.colors\.ink or use a literal value.*clear this refusal/)
  })
})
