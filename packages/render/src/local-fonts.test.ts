import { describe, expect, test } from 'bun:test'
import type { LocalFacesInput } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { localFontsForRender } from './local-fonts.ts'

const truetype = 'AAEAAA=='
const references = [{ local: 'Declared Family', fallback: 'serif' }] as const

describe('local fonts for a render', () => {
  test('keeps only a named face, registers it under the declared family, and reports no fallback', () => {
    const result = localFontsForRender(
      {
        faces: [
          { family: 'declared family', format: 'truetype', data: truetype },
          { family: 'Unreferenced Family', format: 'truetype', data: truetype },
        ],
      },
      references,
    )
    expect(result.faces).toHaveLength(1)
    expect(result.faces[0]).toMatchObject({ family: 'Declared Family', format: 'truetype' })
    expect(result.report).toEqual({ fellBack: [] })
  })

  test('an absent face is a reported fallback, not a refusal', () => {
    expect(localFontsForRender({ faces: [] }, references)).toEqual({ faces: [], report: { fellBack: [{ family: 'Declared Family', fallback: 'serif' }] } })
  })

  test('refuses malformed transport without echoing its data', () => {
    const secret = 'this-is-not-base64'
    expect(() => localFontsForRender({ faces: [{ family: 'Declared Family', format: 'truetype', data: secret }] }, references)).toThrow(RenderRefusedError)
    try {
      localFontsForRender({ faces: [{ family: 'Declared Family', format: 'truetype', data: secret }] }, references)
    } catch (error) {
      expect(String(error)).toContain('Declared Family')
      expect(String(error)).not.toContain(secret)
    }
  })

  test('refuses a signature mismatch and names only the family and formats', () => {
    expect(() => localFontsForRender({ faces: [{ family: 'Declared Family', format: 'woff2', data: truetype }] }, references)).toThrow(
      'declares woff2, but its signature is truetype',
    )
  })

  test('applies host count and decoded-byte limits', () => {
    const faces: LocalFacesInput = [
      { family: 'First', format: 'truetype', data: truetype },
      { family: 'Second', format: 'truetype', data: truetype },
    ]
    expect(() => localFontsForRender({ faces, limits: { count: 1 } }, [])).toThrow('"Second" exceeds the count limit of 1')
    expect(() => localFontsForRender({ faces: faces.slice(0, 1), limits: { bytes: 3 } }, [])).toThrow('"First" exceeds the byte limit of 3')
    expect(() =>
      localFontsForRender({ faces: [{ family: 'First', format: 'truetype', data: 'not-canonical-but-oversized' }], limits: { bytes: 1 } }, []),
    ).toThrow('"First" exceeds the byte limit of 1')
  })

  test('retains no decoded buffer after the prepared faces leave the call', async () => {
    const weak = (() => {
      const result = localFontsForRender({ faces: [{ family: 'Declared Family', format: 'truetype', data: truetype }] }, references)
      const data = result.faces[0]?.data as Uint8Array
      return new WeakRef(data)
    })()
    for (let attempt = 0; attempt < 20 && weak.deref(); attempt += 1) {
      Bun.gc(true)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    expect(weak.deref()).toBeUndefined()
  })
})
