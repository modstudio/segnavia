import { describe, expect, test } from 'bun:test'
import { resolveBrand } from './brand.ts'
import { Document } from './document.ts'

const signal = new AbortController().signal
const page = (brand?: string) =>
  Document.parse({ type: 'document', kind: 'page', brand, children: [{ type: 'page', body: { html: '<p>Body</p>' } }] })

describe('resolveBrand', () => {
  test('returns undefined when the document names no brand', async () => {
    expect(await resolveBrand(page(), undefined, signal)).toBeUndefined()
  })

  test('refuses a named brand without a source', async () => {
    await expect(resolveBrand(page('house'), undefined, signal)).rejects.toThrow(/Brand "house".*BrandSource.*remove the brand name/)
  })

  test('refuses an unknown brand', async () => {
    await expect(resolveBrand(page('house'), { brand: async () => undefined }, signal)).rejects.toThrow(/Brand "house".*unknown.*return that brand/)
  })

  test('validates the returned brand and names its key path', async () => {
    await expect(resolveBrand(page('house'), { brand: async () => ({ tokens: { colors: { Bad: '#fff' } } }) as never }, signal)).rejects.toThrow(
      /Brand "house".*tokens.colors.Bad.*valid Brand/,
    )
  })

  test('returns the parsed brand', async () => {
    await expect(resolveBrand(page('house'), { brand: async () => ({ tokens: { colors: { ink: '#112233' } } }) }, signal)).resolves.toEqual({
      tokens: { colors: { ink: '#112233' } },
    })
  })
})
