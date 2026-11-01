import { describe, expect, test } from 'bun:test'
import { resolveFontFace } from './font-face.ts'
import { FontFaceRefusedError } from './font-refusal.ts'

function sfnt(name: string): Uint8Array {
  const encoded = Uint8Array.from([...name].flatMap((character) => [0, character.charCodeAt(0)]))
  const nameData = new Uint8Array(18 + encoded.length)
  const nameView = new DataView(nameData.buffer)
  nameView.setUint16(2, 1)
  nameView.setUint16(4, 18)
  nameView.setUint16(6, 3)
  nameView.setUint16(8, 1)
  nameView.setUint16(10, 0x409)
  nameView.setUint16(12, 6)
  nameView.setUint16(14, encoded.length)
  nameData.set(encoded, 18)
  const bytes = new Uint8Array(28 + nameData.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, 1)
  bytes.set(new TextEncoder().encode('name'), 12)
  view.setUint32(20, 28)
  view.setUint32(24, nameData.length)
  bytes.set(nameData, 28)
  return bytes
}

function collection(face: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(16 + face.length)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('ttcf'))
  view.setUint32(4, 0x00010000)
  view.setUint32(8, 1)
  view.setUint32(12, 16)
  bytes.set(face, 16)
  view.setUint32(16 + 20, 16 + 28)
  return bytes
}

describe('resolveFontFace', () => {
  const standalone = sfnt('Fixture-Regular')
  const packed = collection(standalone)

  test('extracts a named face and refuses an unnamed collection', () => {
    expect(resolveFontFace(packed, 'collection', 'Fixture-Regular').format).toBe('truetype')
    expect(() => resolveFontFace(packed, 'collection')).toThrow('font collection requires a PostScript name; it holds Fixture-Regular')
  })

  test('checks a named standalone sfnt and preserves an unnamed one', () => {
    expect(resolveFontFace(standalone, 'truetype', 'Fixture-Regular').data).toBe(standalone)
    expect(() => resolveFontFace(standalone, 'truetype', 'Other')).toThrow('font face has PostScript name Fixture-Regular, not Other')
    expect(resolveFontFace(standalone, 'truetype').data).toBe(standalone)
  })

  test('refuses standalone bytes declared as a collection even when named', () => {
    const work = () => resolveFontFace(standalone, 'collection', 'Fixture-Regular')
    expect(work).toThrow(FontFaceRefusedError)
    expect(work).toThrow('font declared as a collection does not contain a font collection')
  })

  test('keeps a named WOFF without inspecting its name', () => {
    const woff = new TextEncoder().encode('wOFFdata')
    expect(resolveFontFace(woff, 'woff', 'Fixture-Regular')).toEqual({ data: woff, format: 'woff' })
  })
})
