import { describe, expect, test } from 'bun:test'
import { FontReference, FontReferenceInput } from './fonts.ts'

describe('FontReference', () => {
  test('reads stored references tolerantly and writes them strictly', () => {
    expect(FontReference.parse({ app: 'Body', future: true })).toEqual({ app: 'Body' })
    expect(FontReference.parse({ local: 'Arial', fallback: 'Body', future: true })).toEqual({ local: 'Arial', fallback: 'Body' })
    expect(() => FontReferenceInput.parse({ app: 'Body', future: true })).toThrow()
  })
})
