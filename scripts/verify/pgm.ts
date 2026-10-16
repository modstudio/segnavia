import { readFileSync } from 'node:fs'
import { MM_PER_PT } from '@segnavia/format'

export interface PgmRaster {
  width: number
  height: number
  pixels: Uint8Array
}

export function readPgm(file: string): PgmRaster {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while (offset < bytes.length) {
      if (bytes[offset] === 35) while (offset < bytes.length && bytes[offset] !== 10) offset++
      else if ((bytes[offset] ?? 0) <= 32) offset++
      else break
    }
    const start = offset
    while (offset < bytes.length && (bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P5') throw new Error(`The raster at ${file} is not a raw PGM.`)
  const width = Number(token())
  const height = Number(token())
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit grayscale.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return { width, height, pixels: bytes.subarray(offset) }
}

export function rasterValue(raster: PgmRaster, xMm: number, yMm: number): number {
  const x = Math.round(xMm / MM_PER_PT)
  const y = Math.round(yMm / MM_PER_PT)
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return 255
  return raster.pixels[y * raster.width + x] ?? 255
}

export function darkestNear(raster: PgmRaster, xMm: number, yMm: number): number {
  let darkest = 255
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) darkest = Math.min(darkest, rasterValue(raster, xMm + dx * MM_PER_PT, yMm + dy * MM_PER_PT))
  }
  return darkest
}
