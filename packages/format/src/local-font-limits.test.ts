import { describe, expect, test } from 'bun:test'
import { LOCAL_FONT_LIMITS, localFontLimitRefusal } from './local-font-limits.ts'

describe('local font limits', () => {
  test('allow several complete families under the shared defaults', () => {
    expect(LOCAL_FONT_LIMITS).toEqual({ count: 64, bytes: 32 * 1024 * 1024 })
    expect(localFontLimitRefusal(Array.from({ length: 18 }, (_, index) => ({ family: `Face ${index}`, bytes: 4 })))).toBeUndefined()
  })

  test('names the first face beyond a count or decoded-byte bound', () => {
    const faces = Array.from({ length: 65 }, (_, index) => ({ family: `Face ${index}`, bytes: 4 }))
    expect(localFontLimitRefusal(faces)).toBe(
      'The local face "Face 64" exceeds the count limit of 64; pass higher limits or declare fewer local font families to clear this refusal.',
    )
    expect(localFontLimitRefusal(faces.slice(0, 2), { bytes: 7 })).toBe(
      'The local face "Face 1" exceeds the byte limit of 7; pass higher limits or declare fewer local font families to clear this refusal.',
    )
  })

  test('accepts overrides and refuses invalid limits', () => {
    expect(localFontLimitRefusal([{ family: 'Face', bytes: 4 }], { count: 1, bytes: 4 })).toBeUndefined()
    expect(localFontLimitRefusal([], { count: -1 })).toBe(
      'The local font count limit must be a non-negative safe integer; pass valid limits to clear this refusal.',
    )
  })
})
