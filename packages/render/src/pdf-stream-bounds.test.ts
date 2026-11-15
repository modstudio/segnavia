import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePdfStreamBounded } from './pdf-stream-bounds.ts'

function bits(codes: readonly number[]): Uint8Array {
  const value = codes.map((code) => code.toString(2).padStart(9, '0')).join('')
  return Uint8Array.from(
    Array.from({ length: Math.ceil(value.length / 8) }, (_, index) => Number.parseInt(value.slice(index * 8, index * 8 + 8).padEnd(8, '0'), 2)),
  )
}

test.each([
  ['FlateDecode', deflateSync(Uint8Array.of(65)), Uint8Array.of(65)],
  ['LZWDecode', bits([256, 65, 257]), Uint8Array.of(65)],
  ['ASCII85Decode', new TextEncoder().encode('5l~>'), Uint8Array.of(65)],
  ['ASCIIHexDecode', new TextEncoder().encode('41>'), Uint8Array.of(65)],
  ['RunLengthDecode', Uint8Array.of(0, 65, 128), Uint8Array.of(65)],
] as const)('bounds and decodes %s object streams', (filter, encoded, decoded) => {
  expect(decodePdfStreamBounded(encoded, [filter], 4, 1)).toEqual(decoded)
  expect(() => decodePdfStreamBounded(encoded, [filter], 4, 0)).toThrow('limits.input.streamBytes limit of 0')
})

test('decodes a filter chain stage by stage and refuses nine filters', () => {
  const encoded = new TextEncoder().encode('34313E>')
  expect(decodePdfStreamBounded(encoded, ['ASCIIHexDecode', 'ASCIIHexDecode'], 4, 8)).toEqual(Uint8Array.of(65))
  expect(() =>
    decodePdfStreamBounded(
      Uint8Array.of(),
      Array.from({ length: 9 }, () => 'ASCIIHexDecode'),
      4,
      8,
    ),
  ).toThrow('decode filter chain of 9')
})
