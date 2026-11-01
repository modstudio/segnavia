import { describe, expect, test } from 'bun:test'
import type { LocalFacesInput } from '@segnavia/format'
import { bytesToBase64 } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import { localFontsForRender } from './local-fonts.ts'

const truetype = 'AAEAAA=='
const references = [{ local: 'Declared Family', fallback: 'serif' }] as const

function collectionData(name: string): string {
  const encoded = Uint8Array.from([...name].flatMap((character) => [0, character.charCodeAt(0)]))
  const bytes = new Uint8Array(62 + encoded.length)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('ttcf'))
  view.setUint32(4, 0x00010000)
  view.setUint32(8, 1)
  view.setUint32(12, 16)
  view.setUint32(16, 0x00010000)
  view.setUint16(20, 1)
  bytes.set(new TextEncoder().encode('name'), 28)
  view.setUint32(36, 44)
  view.setUint32(40, 18 + encoded.length)
  view.setUint16(46, 1)
  view.setUint16(48, 18)
  view.setUint16(50, 3)
  view.setUint16(52, 1)
  view.setUint16(54, 0x409)
  view.setUint16(56, 6)
  view.setUint16(58, encoded.length)
  bytes.set(encoded, 62)
  return bytesToBase64(bytes)
}

describe('local fonts for a render', () => {
  test('serves the named face from a collection transport', () => {
    const result = localFontsForRender(
      {
        faces: [{ family: 'Declared Family', format: 'collection', postscriptName: 'CollectionFace-Regular', data: collectionData('CollectionFace-Regular') }],
      },
      references,
    )
    expect(result.faces[0]).toMatchObject({ family: 'Declared Family', format: 'truetype' })
    expect(result.faces[0]?.data.slice(0, 4)).toEqual(Uint8Array.of(0, 1, 0, 0))
  })

  test('translates collection resolution refusals to the render refusal type', () => {
    const work = () =>
      localFontsForRender({ faces: [{ family: 'Declared Family', format: 'collection', postscriptName: 'Missing', data: truetype }] }, references)
    expect(work).toThrow(RenderRefusedError)
    expect(work).toThrow('font declared as a collection does not contain a font collection')
  })

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

  test('accepts 18 faces and shares default overflow refusals with frame packing', () => {
    const face = { family: 'Local Family', format: 'truetype' as const, data: truetype }
    expect(localFontsForRender({ faces: Array.from({ length: 18 }, () => face) }, [{ local: 'Local Family', fallback: 'serif' }]).faces).toHaveLength(18)
    expect(() => localFontsForRender({ faces: Array.from({ length: 65 }, () => face) }, [])).toThrow(
      'The local face "Local Family" exceeds the count limit of 64; pass higher limits or declare fewer local font families to clear this refusal.',
    )
    expect(() => localFontsForRender({ faces: [face], limits: { bytes: 3 } }, [])).toThrow(
      'The local face "Local Family" exceeds the byte limit of 3; pass higher limits or declare fewer local font families to clear this refusal.',
    )
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
