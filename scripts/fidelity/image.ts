import path from 'node:path'
import { buildProofTable, fromGray, fromPress, type Profile, type ProofTable, proofPixels, readProfile } from '../../packages/render/src/color/index.ts'
import { DEFAULT_NEUTRAL_TOLERANCE, pressColor, snapsToNeutral } from '../../packages/render/src/press/color-policy.ts'
import {
  ALIGNMENT_SEARCH_RADIUS,
  ALIGNMENT_TOLERANCE,
  MARKER_BORDER,
  MARKER_BORDER_COLOR,
  MARKER_FILL,
  MARKER_MATCH_MAX_SCORE,
  MARKER_SIZE,
  SCALE,
} from './config.ts'
import { decodeDeviceTiff } from './tiff.ts'
import type { Box, Difference, GlyphBox } from './types.ts'

function command(args: string[]): Uint8Array {
  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed: ${result.stderr.toString().trim()}`)
  return result.stdout
}

export async function imageSize(file: string): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
  if (new TextDecoder().decode(bytes.subarray(1, 4)) !== 'PNG') throw new Error(`${file} is not a PNG.`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function rgb(file: string, width: number, height: number): Uint8Array {
  const bytes = command([
    'ffmpeg',
    '-loglevel',
    'error',
    '-i',
    file,
    '-vf',
    `scale=${width}:${height}:flags=lanczos`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ])
  if (bytes.byteLength !== width * height * 3) throw new Error(`Unexpected decoded size for ${file}.`)
  return bytes
}

export function glyphLineBoxes(file: string, width: number, height: number): GlyphBox[] {
  const pixels = rgb(file, width, height)
  const occupied = new Uint8Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3
      if ((pixels[offset] ?? 255) < 96 && (pixels[offset + 1] ?? 255) < 96 && (pixels[offset + 2] ?? 255) < 96) {
        occupied[y] = 1
        break
      }
    }
  }
  const bands: Array<{ top: number; bottom: number }> = []
  for (let y = 0; y < height; y++) {
    if (!occupied[y]) continue
    const top = y
    while (y + 1 < height && occupied[y + 1]) y++
    if (y - top >= 3) bands.push({ top, bottom: y + 1 })
  }
  return bands.map(({ top, bottom }) => {
    let left = width
    let right = 0
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3
        if ((pixels[offset] ?? 255) < 96 && (pixels[offset + 1] ?? 255) < 96 && (pixels[offset + 2] ?? 255) < 96) {
          left = Math.min(left, x)
          right = Math.max(right, x + 1)
        }
      }
    }
    return { x: left, y: top, width: right - left, height: bottom - top }
  })
}

export const proofTable = (profileBytes: Uint8Array): ProofTable => buildProofTable(readProfile(profileBytes))

export function proofPressPixels(profile: Profile, table: ProofTable, source: Uint8Array): Uint8ClampedArray {
  const proved = proofPixels(table, source)
  for (let offset = 0; offset < source.length; offset += 3) {
    const rgb: [number, number, number] = [(source[offset] ?? 0) / 255, (source[offset + 1] ?? 0) / 255, (source[offset + 2] ?? 0) / 255]
    if (!snapsToNeutral(rgb, DEFAULT_NEUTRAL_TOLERANCE)) continue
    const proof = fromPress(profile, pressColor(profile, rgb))
    proved[offset] = proof[0] * 255
    proved[offset + 1] = proof[1] * 255
    proved[offset + 2] = proof[2] * 255
  }
  return proved
}

export function proofImage(reference: string, destination: string, width: number, height: number, table: ProofTable, profile?: Profile): void {
  const source = rgb(reference, width, height)
  const proved = profile?.colorSpace === 'CMYK' ? proofPressPixels(profile, table, source) : proofPixels(table, source)
  const result = Bun.spawnSync(
    ['ffmpeg', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', '-y', destination],
    { stdin: proved, stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(`Could not make ${path.basename(destination)}: ${result.stderr.toString().trim()}`)
}

export function deviceToSrgb(profile: Profile, source: Uint8Array): Uint8ClampedArray {
  const channels = profile.colorSpace === 'CMYK' ? 4 : profile.colorSpace === 'GRAY' ? 1 : 0
  if (!channels || source.length % channels !== 0) throw new Error(`Unexpected ${profile.colorSpace.trim()} device pixel byte length ${source.length}.`)
  const result = new Uint8ClampedArray((source.length / channels) * 3)
  for (let sourceOffset = 0, destinationOffset = 0; sourceOffset < source.length; sourceOffset += channels, destinationOffset += 3) {
    const rgb =
      channels === 4
        ? fromPress(profile, [
            (source[sourceOffset] ?? 0) / 255,
            (source[sourceOffset + 1] ?? 0) / 255,
            (source[sourceOffset + 2] ?? 0) / 255,
            (source[sourceOffset + 3] ?? 0) / 255,
          ])
        : fromGray(profile, [(source[sourceOffset] ?? 0) / 255])
    result[destinationOffset] = rgb[0] * 255
    result[destinationOffset + 1] = rgb[1] * 255
    result[destinationOffset + 2] = rgb[2] * 255
  }
  return result
}

export async function modelPressRaster(source: string, destination: string, width: number, height: number, profile: Profile): Promise<void> {
  const channels = profile.colorSpace === 'CMYK' ? 4 : profile.colorSpace === 'GRAY' ? 1 : undefined
  if (!channels) throw new Error(`Cannot model a ${profile.colorSpace.trim()} press raster.`)
  const bytes = new Uint8Array(await Bun.file(source).arrayBuffer())
  const proved = deviceToSrgb(profile, decodeDeviceTiff(bytes, width, height, channels))
  const result = Bun.spawnSync(
    ['ffmpeg', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', '-y', destination],
    { stdin: proved, stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(`Could not make ${path.basename(destination)}: ${result.stderr.toString().trim()}`)
}

export function cropImage(source: string, destination: string, box: Box): void {
  const crop = `crop=${Math.round(box.width)}:${Math.round(box.height)}:${Math.round(box.x)}:${Math.round(box.y)}`
  const result = Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-i', source, '-vf', crop, '-frames:v', '1', '-y', destination], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) throw new Error(`Could not crop ${path.basename(destination)}: ${result.stderr.toString().trim()}`)
}

export function markerPosition(
  pixels: Uint8Array,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
): { x: number; y: number; score: number } {
  const size = MARKER_SIZE * SCALE
  const borderSample = Math.max(1, Math.floor((MARKER_BORDER * SCALE) / 2))
  const samples = [
    { x: borderSample, y: borderSample, color: MARKER_BORDER_COLOR },
    { x: size - borderSample - 1, y: borderSample, color: MARKER_BORDER_COLOR },
    { x: borderSample, y: size - borderSample - 1, color: MARKER_BORDER_COLOR },
    { x: size - borderSample - 1, y: size - borderSample - 1, color: MARKER_BORDER_COLOR },
    { x: Math.floor(size / 2), y: Math.floor(size / 2), color: MARKER_FILL },
  ]
  let best = { x: expectedX, y: expectedY, score: Number.POSITIVE_INFINITY }
  for (let y = Math.max(0, expectedY - ALIGNMENT_SEARCH_RADIUS); y <= Math.min(height - size, expectedY + ALIGNMENT_SEARCH_RADIUS); y++) {
    for (let x = Math.max(0, expectedX - ALIGNMENT_SEARCH_RADIUS); x <= Math.min(width - size, expectedX + ALIGNMENT_SEARCH_RADIUS); x++) {
      let score = 0
      for (const sample of samples) {
        const offset = ((y + sample.y) * width + x + sample.x) * 3
        for (let channel = 0; channel < 3; channel++) score += Math.abs((pixels[offset + channel] ?? 0) - (sample.color[channel] ?? 0))
      }
      if (score < best.score) best = { x, y, score }
    }
  }
  return best
}

export function alignmentOffset(
  reference: string,
  actual: string,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
): { offsetX: number; offsetY: number; referenceScore: number; measuredScore: number; passed: boolean; error?: string } {
  return alignmentFromPixels(rgb(reference, width, height), rgb(actual, width, height), width, height, expectedX, expectedY)
}

export function alignmentFromPixels(
  reference: Uint8Array,
  actual: Uint8Array,
  width: number,
  height: number,
  expectedX: number,
  expectedY: number,
): { offsetX: number; offsetY: number; referenceScore: number; measuredScore: number; passed: boolean; error?: string } {
  const expected = markerPosition(reference, width, height, expectedX, expectedY)
  const measured = markerPosition(actual, width, height, expectedX, expectedY)
  const offsetX = measured.x - expected.x
  const offsetY = measured.y - expected.y
  const scorePassed = expected.score <= MARKER_MATCH_MAX_SCORE && measured.score <= MARKER_MATCH_MAX_SCORE
  const positionPassed = Math.abs(offsetX) <= ALIGNMENT_TOLERANCE && Math.abs(offsetY) <= ALIGNMENT_TOLERANCE
  const error = !scorePassed
    ? `marker not found: reference score ${expected.score}, reader score ${measured.score}, maximum ${MARKER_MATCH_MAX_SCORE}, search window ±${ALIGNMENT_SEARCH_RADIUS} device px`
    : !positionPassed
      ? `marker offset ${offsetX}, ${offsetY} device px exceeds tolerance ±${ALIGNMENT_TOLERANCE}`
      : undefined
  return {
    offsetX,
    offsetY,
    referenceScore: expected.score,
    measuredScore: measured.score,
    passed: scorePassed && positionPassed,
    error,
  }
}

export function differencePixels(left: Uint8Array, right: Uint8Array, width: number, height: number, mask?: Uint8Array, selected = true): Difference {
  if (left.length !== width * height * 3 || right.length !== left.length) throw new Error('Unexpected difference raster size.')
  if (mask && mask.length !== width * height) throw new Error('Unexpected difference mask size.')
  const histogram = new Uint32Array(256)
  let sum = 0
  let count = 0
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (mask && Boolean(mask[pixel]) !== selected) continue
    const offset = pixel * 3
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs((left[offset + channel] ?? 0) - (right[offset + channel] ?? 0))
      histogram[delta] = (histogram[delta] ?? 0) + 1
      sum += delta
      count++
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

export function difference(reference: string, actual: string, width: number, height: number, box?: Box, mask?: Uint8Array, selected = true): Difference {
  const left = rgb(reference, width, height)
  const right = rgb(actual, width, height)
  const area = box ?? { x: 0, y: 0, width, height }
  const x0 = Math.max(0, Math.floor(area.x))
  const y0 = Math.max(0, Math.floor(area.y))
  const x1 = Math.min(width, Math.ceil(area.x + area.width))
  const y1 = Math.min(height, Math.ceil(area.y + area.height))
  const histogram = new Uint32Array(256)
  let sum = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask && Boolean(mask[y * width + x]) !== selected) continue
      const offset = (y * width + x) * 3
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs((left[offset + channel] ?? 0) - (right[offset + channel] ?? 0))
        histogram[delta] = (histogram[delta] ?? 0) + 1
        sum += delta
        count++
      }
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

export function writeMask(mask: Uint8Array, destination: string, width: number, height: number): void {
  if (mask.length !== width * height) throw new Error('Unexpected mask size.')
  const pixels = Uint8Array.from(mask, (value) => (value ? 255 : 0))
  const result = Bun.spawnSync(
    ['ffmpeg', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', '-y', destination],
    { stdin: pixels, stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(`Could not make ${path.basename(destination)}: ${result.stderr.toString().trim()}`)
}

export function sideBySide(reference: string, actual: string, box: Box, destination: string): void {
  const crop = `crop=${Math.max(1, Math.round(box.width))}:${Math.max(1, Math.round(box.height))}:${Math.round(box.x)}:${Math.round(box.y)}`
  const result = Bun.spawnSync(
    [
      'ffmpeg',
      '-loglevel',
      'error',
      '-i',
      reference,
      '-i',
      actual,
      '-filter_complex',
      `[0:v]${crop}[a];[1:v]${crop}[b];[a][b]hstack=inputs=2`,
      '-frames:v',
      '1',
      '-y',
      destination,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(`Could not make ${path.basename(destination)}: ${result.stderr.toString().trim()}`)
}
