import { describe, expect, test } from 'bun:test'
import { sineWav } from './sine-wav.ts'

const SAMPLE_RATE = 44100
const FREQUENCY = 440
const AMPLITUDE = 32767 / 8
const HEADER_BYTES = 44

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

describe('sineWav', () => {
  const seconds = 2.4
  const wav = sineWav(seconds)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const sampleCount = Math.round(seconds * SAMPLE_RATE)
  const dataBytes = sampleCount * 2

  test('writes a PCM WAV header', () => {
    expect(ascii(wav, 0, 4)).toBe('RIFF')
    expect(ascii(wav, 8, 4)).toBe('WAVE')
    expect(view.getUint32(4, true)).toBe(HEADER_BYTES - 8 + dataBytes)
    expect(ascii(wav, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(ascii(wav, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(dataBytes)
    expect(wav.byteLength).toBe(HEADER_BYTES + dataBytes)
  })

  test('contains 2.4 s of samples that follow a 440 Hz sine at 1/8 full scale', () => {
    expect(sampleCount).toBe(105_840)
    const expected = Array.from({ length: sampleCount }, (_, i) => Math.round(Math.sin((2 * Math.PI * FREQUENCY * i) / SAMPLE_RATE) * AMPLITUDE) || 0)
    const samples = Array.from({ length: sampleCount }, (_, i) => view.getInt16(HEADER_BYTES + i * 2, true))
    expect(samples).toEqual(expected)
  })
})
