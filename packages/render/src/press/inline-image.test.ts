import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { binaryString, parseInlineImage } from './inline-image.ts'

test('finds raw and Flate inline image ends from the declared samples', () => {
  const samples = Buffer.from(' EI ', 'latin1')
  const rawPrefix = Buffer.from(' /W 4 /H 1 /BPC 8 /CS /G ID\n')
  const raw = binaryString(Buffer.concat([rawPrefix, samples, Buffer.from(' EI')]))
  expect(parseInlineImage(raw, 0).dataEnd).toBe(rawPrefix.length + samples.length)

  const compressed = deflateSync(samples, { level: 0 })
  const flatePrefix = Buffer.from(' /W 4 /H 1 /BPC 8 /CS /G /F /Fl ID\n')
  const flate = binaryString(Buffer.concat([flatePrefix, compressed, Buffer.from(' EI')]))
  expect(parseInlineImage(flate, 0).dataEnd).toBe(flatePrefix.length + compressed.length)
})

function dctInline(jpeg: Uint8Array): { dataEnd: number; source: string } {
  const prefix = Buffer.from(' /W 8 /H 8 /BPC 8 /CS /CMYK /F /DCT ID\n')
  return { dataEnd: prefix.length + jpeg.length, source: binaryString(Buffer.concat([prefix, Buffer.from(jpeg), Buffer.from('\nEI')])) }
}

test('finds a DCTDecode inline image end at JPEG EOI', () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9)
  const found = dctInline(jpeg)
  expect(parseInlineImage(found.source, 0).dataEnd).toBe(found.dataEnd)
})

test('bounds a DCTDecode inline image at its real EOI when an APP segment contains FF D9 before whitespace and EI', () => {
  const jpeg = Uint8Array.of(
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x07,
    0xff,
    0xd9,
    0x0a,
    0x45,
    0x49,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x00,
    0x00,
    0x00,
    0x3f,
    0x00,
    0xff,
    0xd9,
  )
  const found = dctInline(jpeg)
  expect(parseInlineImage(found.source, 0).dataEnd).toBe(found.dataEnd)
})
