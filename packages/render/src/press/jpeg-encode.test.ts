import { expect, test } from 'bun:test'
import { decodeBaselineCmykJpeg } from './jpeg-decode.test-helper.ts'
import { encodeCmykJpeg } from './jpeg-encode.ts'

function flatCmyk(width: number, height: number, cmyk: readonly [number, number, number, number]): Uint8Array {
  const samples = new Uint8Array(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) samples.set(cmyk, pixel * 4)
  return samples
}

function invert(samples: Uint8Array): Uint8Array {
  return Uint8Array.from(samples, (value) => 255 - value)
}

function markerSequence(bytes: Uint8Array): number[] {
  const codes: number[] = []
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] !== 0xff) continue
    const next = bytes[index + 1] ?? 0
    if (next === 0) continue
    codes.push(next)
    if (next === 0xda) break
  }
  if (bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) codes.push(0xd9)
  return codes
}

function scanRange(bytes: Uint8Array): { start: number; end: number } {
  let start = 0
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xda) {
      const length = ((bytes[index + 2] ?? 0) << 8) | (bytes[index + 3] ?? 0)
      start = index + 2 + length
      break
    }
  }
  return { start, end: bytes.length - 2 }
}

function sof0(bytes: Uint8Array): { precision: number; components: number; sampling: number[] } {
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] !== 0xff || bytes[index + 1] !== 0xc0) continue
    const payload = index + 4
    const components = bytes[payload + 5] ?? 0
    const sampling = [0, 1, 2, 3].map((component) => bytes[payload + 7 + component * 3] ?? 0)
    return { precision: bytes[payload] ?? 0, components, sampling }
  }
  throw new Error('missing SOF0')
}

test('baseline CMYK JPEG writes SOI, APP14 transform 0, DQT, SOF0 with four 1x1 components, DHT, SOS, EOI', () => {
  const bytes = encodeCmykJpeg(8, 8, flatCmyk(8, 8, [40, 80, 120, 16]), 85)
  expect(markerSequence(bytes)).toEqual([0xd8, 0xee, 0xdb, 0xc0, 0xc4, 0xc4, 0xda, 0xd9])
  const adobe = bytes.subarray(6, 20)
  expect([...adobe.subarray(0, 5)]).toEqual([0x41, 0x64, 0x6f, 0x62, 0x65])
  expect(adobe[11]).toBe(0)
  const frame = sof0(bytes)
  expect(frame).toEqual({ precision: 8, components: 4, sampling: [0x11, 0x11, 0x11, 0x11] })
})

test('entropy-coded bytes stuff 0xFF as 0xFF 0x00', () => {
  const samples = new Uint8Array(16 * 16 * 4)
  for (let index = 0; index < samples.length; index++) samples[index] = (index * 37 + (index % 251)) & 255
  const bytes = encodeCmykJpeg(16, 16, samples, 40)
  const { start, end } = scanRange(bytes)
  let stuffed = 0
  for (let index = start; index < end; index++) {
    if (bytes[index] !== 0xff) continue
    expect(bytes[index + 1], `unstuffed FF at ${index}`).toBe(0)
    stuffed++
    index++
  }
  expect(stuffed).toBeGreaterThan(0)
})

test('a flat 8x8 block per component round-trips through an independent decode within quality-85 error', () => {
  const source = flatCmyk(8, 8, [32, 96, 160, 48])
  const decoded = decodeBaselineCmykJpeg(encodeCmykJpeg(8, 8, source, 85))
  expect(decoded.width).toBe(8)
  expect(decoded.height).toBe(8)
  expect(decoded.app14?.[11]).toBe(0)
  let total = 0
  let max = 0
  for (let index = 0; index < source.length; index++) {
    const error = Math.abs((decoded.samples[index] ?? 0) - (source[index] ?? 0))
    total += error
    max = Math.max(max, error)
  }
  expect(max).toBeLessThanOrEqual(2)
  expect(total / source.length).toBeLessThanOrEqual(1)
})

test('inverted samples decode to the complement, so polarity is not a no-op', () => {
  const source = flatCmyk(8, 8, [32, 96, 160, 48])
  const inverted = decodeBaselineCmykJpeg(encodeCmykJpeg(8, 8, invert(source), 85)).samples
  let max = 0
  for (let index = 0; index < source.length; index++) max = Math.max(max, Math.abs((inverted[index] ?? 0) - (source[index] ?? 0)))
  expect(max).toBeGreaterThan(80)
})

function photoCmyk(width: number, height: number): Uint8Array {
  const samples = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4
      const noise = ((x * 73 + y * 149) % 64) - 32
      samples[pixel] = Math.max(0, Math.min(255, Math.round((x / width) * 180) + noise))
      samples[pixel + 1] = Math.max(0, Math.min(255, Math.round((y / height) * 160) + noise))
      samples[pixel + 2] = Math.max(0, Math.min(255, 90 + noise))
      samples[pixel + 3] = Math.max(0, Math.min(255, 40 + (noise >> 1)))
    }
  }
  return samples
}

function channelError(source: Uint8Array, decoded: Uint8Array): { mean: number; max: number } {
  let total = 0
  let max = 0
  for (let index = 0; index < source.length; index++) {
    const error = Math.abs((decoded[index] ?? 0) - (source[index] ?? 0))
    total += error
    max = Math.max(max, error)
  }
  return { mean: total / source.length, max }
}

// 192x128 noise-plus-gradient convert PDFs: lossless 138078 bytes, JPEG 85 105419 (mean/max 1.67/21), JPEG 60 98526 (3.29/59).
test('a photographic noise-plus-gradient raster is smaller as JPEG than as raw CMYK and stays within a measured error', () => {
  const source = photoCmyk(192, 128)
  const jpeg85 = encodeCmykJpeg(192, 128, source, 85)
  const jpeg60 = encodeCmykJpeg(192, 128, source, 60)
  const error85 = channelError(source, decodeBaselineCmykJpeg(jpeg85).samples)
  const error60 = channelError(source, decodeBaselineCmykJpeg(jpeg60).samples)
  expect(jpeg85.byteLength).toBeLessThan(source.byteLength)
  expect(jpeg60.byteLength).toBeLessThan(jpeg85.byteLength)
  expect(error85.mean).toBeLessThan(6)
  expect(error85.max).toBeLessThan(40)
  expect(error60.mean).toBeGreaterThan(error85.mean * 0.5)
})
