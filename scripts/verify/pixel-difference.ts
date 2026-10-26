export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Difference {
  mean: number
  p99: number
}

export const SCALE = 4
export const READER_RASTER_DPI = 384
// Shmuel agreed these acceptance limits on 2026-10-14.
export const EFFECT_REGION_THRESHOLD = { mean: 2, p99: 24 }

function recordPixelDifference(histogram: Uint32Array, left: Uint8Array, right: Uint8Array, offset: number): number {
  let sum = 0
  for (let channel = 0; channel < 3; channel++) {
    const delta = Math.abs((left[offset + channel] ?? 0) - (right[offset + channel] ?? 0))
    histogram[delta] = (histogram[delta] ?? 0) + 1
    sum += delta
  }
  return sum
}

export function differencePixels(
  left: Uint8Array,
  right: Uint8Array,
  width: number,
  height: number,
  mask?: Uint8Array,
  selected = true,
  box?: Box,
): Difference {
  if (left.length !== width * height * 3 || right.length !== left.length) throw new Error('Unexpected difference raster size.')
  if (mask && mask.length !== width * height) throw new Error('Unexpected difference mask size.')
  const histogram = new Uint32Array(256)
  let sum = 0
  let count = 0
  const area = box ?? { x: 0, y: 0, width, height }
  const x0 = Math.max(0, Math.floor(area.x))
  const y0 = Math.max(0, Math.floor(area.y))
  const x1 = Math.min(width, Math.ceil(area.x + area.width))
  const y1 = Math.min(height, Math.ceil(area.y + area.height))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const pixel = y * width + x
      if (mask && Boolean(mask[pixel]) !== selected) continue
      sum += recordPixelDifference(histogram, left, right, pixel * 3)
      count += 3
    }
  }
  const target = Math.ceil(count * 0.99)
  let seen = 0
  let p99 = 0
  for (; p99 < histogram.length; p99++) {
    seen += histogram[p99] ?? 0
    if (seen >= target) break
  }
  return { mean: count ? sum / count : 0, p99 }
}
