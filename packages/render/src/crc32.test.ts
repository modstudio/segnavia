import { expect, test } from 'bun:test'
import { crc32 } from './crc32.ts'

test('computes standard CRC-32 vectors', () => {
  expect(crc32(new Uint8Array())).toBe(0)
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
})
