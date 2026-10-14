import path from 'node:path'
import { buildProofTable, type ProofTable, proofPixels, readProfile } from '../../packages/render/src/color/index.ts'
import { ALIGNMENT_SEARCH_RADIUS, ALIGNMENT_TOLERANCE, SCALE } from './config.ts'
import type { Box, Difference } from './types.ts'

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

export const proofTable = (profileBytes: Uint8Array): ProofTable => buildProofTable(readProfile(profileBytes))

export function proofImage(reference: string, destination: string, width: number, height: number, table: ProofTable): void {
  const proved = proofPixels(table, rgb(reference, width, height))
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

function markerPosition(image: string, width: number, height: number, expectedX: number, expectedY: number): { x: number; y: number } {
  const pixels = rgb(image, width, height)
  const size = 12 * SCALE
  const samples = [
    { x: SCALE, y: SCALE, color: [254, 1, 253] },
    { x: size - SCALE - 1, y: SCALE, color: [254, 1, 253] },
    { x: SCALE, y: size - SCALE - 1, color: [254, 1, 253] },
    { x: size - SCALE - 1, y: size - SCALE - 1, color: [254, 1, 253] },
    { x: size / 2, y: size / 2, color: [1, 254, 2] },
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
): { offsetX: number; offsetY: number; passed: boolean } {
  const expected = markerPosition(reference, width, height, expectedX, expectedY)
  const measured = markerPosition(actual, width, height, expectedX, expectedY)
  const offsetX = measured.x - expected.x
  const offsetY = measured.y - expected.y
  return {
    offsetX,
    offsetY,
    passed: Math.abs(offsetX) <= ALIGNMENT_TOLERANCE && Math.abs(offsetY) <= ALIGNMENT_TOLERANCE,
  }
}

export function difference(reference: string, actual: string, width: number, height: number, box?: Box): Difference {
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
