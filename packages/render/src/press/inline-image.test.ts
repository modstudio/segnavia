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

test('finds a DCTDecode inline image end at JPEG EOI', () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9)
  const prefix = Buffer.from(' /W 8 /H 8 /BPC 8 /CS /CMYK /F /DCT ID\n')
  const source = binaryString(Buffer.concat([prefix, Buffer.from(jpeg), Buffer.from('\nEI')]))
  expect(parseInlineImage(source, 0).dataEnd).toBe(prefix.length + jpeg.length)
})
