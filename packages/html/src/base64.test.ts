import { describe, expect, test } from 'bun:test'
import { base64ToBytes, bytesToBase64 } from './base64.ts'

describe('base64', () => {
  test('round-trips bytes without a platform codec', () => {
    const bytes = new Uint8Array([0, 1, 0, 0, 255, 128, 64])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  test('refuses malformed encodings', () => {
    expect(base64ToBytes('not base64')).toBeUndefined()
    expect(base64ToBytes('AAAA=')).toBeUndefined()
  })
})
