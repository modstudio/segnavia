import { describe, expect, test } from 'bun:test'
import { jsonSchemas, mediaTextDirection, SOUND_FORMATS, Sound } from './index.ts'

describe('Sound', () => {
  test.each(['mp3', 'm4a', 'ogg', 'wav'] as const)('accepts the %s source format', (format) => {
    expect(Sound.parse({ format, durationMs: 1_000 })).toEqual({ format, durationMs: 1_000 })
    expect(SOUND_FORMATS[format].mime).toMatch(/^audio\//)
  })

  test.each([0, -1])('refuses the non-positive duration %s', (durationMs) => {
    expect(() => Sound.parse({ format: 'mp3', durationMs })).toThrow(/>0/)
  })

  test('refuses unknown fields', () => {
    expect(() => Sound.parse({ format: 'ogg', durationMs: 1_000, waveform: [] })).toThrow(/unknown key.*remove it to clear this refusal/)
  })

  test('accepts an image address and resolves a Hebrew title direction', () => {
    const sound = Sound.parse({ format: 'm4a', durationMs: 1_000, title: { text: 'שלום' }, image: 'images/cover' })
    expect(sound.title && mediaTextDirection(sound.title)).toBe('rtl')
    expect(sound.image).toBe('images/cover')
  })

  test('publishes the sound input schema', () => {
    expect(jsonSchemas().sound).toMatchObject({ type: 'object', required: ['format', 'durationMs'], additionalProperties: false })
  })
})
