import { describe, expect, test } from 'bun:test'
import { catalogFontSource, fontSources } from './catalog-font-source.ts'
import type { FontCatalog } from './font-catalog.ts'
import { type FontSource, HEBREW_UNICODE_RANGE } from './fonts.ts'

const signal = AbortSignal.any([])
const woff2 = (size = 4) => new Uint8Array([...Buffer.from('wOF2'), ...new Uint8Array(Math.max(0, size - 4))])
const catalog = {
  body: {
    family: 'Catalog Body',
    faces: [{ src: 'body.woff2', format: 'woff2' as const, script: 'hebrew' as const }],
    generic: 'serif' as const,
  },
} satisfies FontCatalog

describe('catalogFontSource', () => {
  test('loads a family once under concurrent calls', async () => {
    let loads = 0
    const source = catalogFontSource(catalog, async () => {
      loads++
      await Promise.resolve()
      return woff2()
    })
    const [first, second] = await Promise.all([source.font('body', { signal }), source.font('body', { signal })])
    expect(first).toBe(second)
    expect(loads).toBe(1)
    expect(first?.faces[0]?.unicodeRange).toBe(HEBREW_UNICODE_RANGE)
    expect(await source.font('unknown', { signal })).toBeUndefined()
    expect(await source.font('constructor', { signal })).toBeUndefined()
    expect(await source.font('toString', { signal })).toBeUndefined()
  })

  test("does not let one caller's abort cancel a shared load", async () => {
    let finish: ((bytes: Uint8Array) => void) | undefined
    let loadSignal: AbortSignal | undefined
    const source = catalogFontSource(catalog, (_src, options) => {
      loadSignal = options.signal
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = source.font('body', { signal: firstController.signal })
    const second = source.font('body', { signal: secondController.signal })
    const reason = new Error('cancelled first caller')
    firstController.abort(reason)
    await expect(first).rejects.toBe(reason)
    expect(loadSignal).not.toBe(firstController.signal)
    expect(loadSignal?.aborted).toBe(false)
    finish?.(woff2())
    expect((await second)?.family).toBe('Catalog Body')
    expect((await source.font('body', { signal }))?.family).toBe('Catalog Body')
  })

  test('evicts a rejected load and retries', async () => {
    let loads = 0
    const source = catalogFontSource(catalog, async () => {
      if (++loads === 1) throw new Error('offline')
      return woff2()
    })
    await expect(source.font('body', { signal })).rejects.toThrow('offline')
    expect(await source.font('body', { signal })).toBeDefined()
    expect(loads).toBe(2)
  })

  test('refuses non-font bytes and a declared format mismatch with the family and src', async () => {
    const invalid = catalogFontSource(catalog, async () => new Uint8Array([1, 2, 3, 4]))
    await expect(invalid.font('body', { signal })).rejects.toThrow(/Catalog Body.*body\.woff2.*not a supported font/)
    const mismatch = catalogFontSource(catalog, async () => new Uint8Array(Buffer.from('wOFF')))
    await expect(mismatch.font('body', { signal })).rejects.toThrow(/Catalog Body.*body\.woff2.*declares woff2.*woff/)
  })

  test('refuses each and family limits one byte over', async () => {
    const each = catalogFontSource(catalog, async () => woff2(5), { limits: { each: 4 } })
    await expect(each.font('body', { signal })).rejects.toMatchObject({
      message: expect.stringContaining("raise the font source's limits.each option, or use a smaller font"),
      exceeded: [{ measure: 'fontSource.each', actual: 5, limit: 4, message: expect.any(String), where: expect.any(String) }],
    })
    const twoFaces = {
      body: {
        family: 'Body',
        faces: [
          { src: 'a', format: 'woff2' as const },
          { src: 'b', format: 'woff2' as const },
        ],
      },
    }
    const family = catalogFontSource(twoFaces, async () => woff2(4), { limits: { each: 4, bytes: 7 } })
    await expect(family.font('body', { signal })).rejects.toMatchObject({
      message: expect.stringContaining("raise the font source's limits.bytes option, or use a smaller font family"),
      exceeded: [{ measure: 'fontSource.bytes', actual: 8, limit: 7, message: expect.any(String), where: expect.any(String) }],
    })
  })

  test('refuses invalid source limits at construction', () => {
    expect(() => catalogFontSource(catalog, async () => woff2(), { limits: { each: -1 } })).toThrow(/non-negative safe integer/)
    expect(() => catalogFontSource(catalog, async () => woff2(), { limits: { bytes: 1.5 } })).toThrow(/non-negative safe integer/)
  })

  test('carries a collection PostScript name onto the loaded face', async () => {
    const collection = {
      body: {
        family: 'Collection Body',
        faces: [{ src: 'body.ttc', format: 'collection' as const, postscriptName: 'Body-Regular' }],
      },
    }
    const source = catalogFontSource(collection, async () => new Uint8Array(Buffer.from('ttcf')))
    expect((await source.font('body', { signal }))?.faces[0]).toMatchObject({ postscriptName: 'Body-Regular' })
  })
})

describe('fontSources', () => {
  test('asks in order, falls through undefined, and passes the signal', async () => {
    const calls: string[] = []
    let received: AbortSignal | undefined
    const missing: FontSource = {
      font: async () => {
        calls.push('missing')
        return undefined
      },
    }
    const found: FontSource = {
      font: async (_name, options) => {
        calls.push('found')
        received = options.signal
        return { family: 'Found', faces: [] }
      },
    }
    expect((await fontSources(missing, found).font('body', { signal }))?.family).toBe('Found')
    expect(calls).toEqual(['missing', 'found'])
    expect(received).toBe(signal)
  })

  test('propagates a rejection without asking later sources', async () => {
    let later = false
    const rejected: FontSource = { font: async () => Promise.reject(new Error('refused')) }
    const unused: FontSource = {
      font: async () => {
        later = true
        return undefined
      },
    }
    await expect(fontSources(rejected, unused).font('body', { signal })).rejects.toThrow('refused')
    expect(later).toBe(false)
  })
})
