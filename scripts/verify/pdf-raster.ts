import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MM_PER_PT, PX_PER_MM } from '@segnavia/format'

export interface Raster {
  width: number
  height: number
  pixels: Uint8Array
}

export function readPpm(file: string): Raster {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while ((bytes[offset] ?? 0) <= 32) offset++
    const start = offset
    while ((bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P6') throw new Error(`The raster at ${file} is not a raw PPM.`)
  const width = Number(token())
  const height = Number(token())
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit RGB.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return { width, height, pixels: bytes.subarray(offset) }
}

export function readPgm(file: string): Raster {
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

export function rasterPoint(raster: Raster, x: number, y: number): number {
  const column = Math.round(x)
  const row = Math.round(y)
  if (column < 0 || row < 0 || column >= raster.width || row >= raster.height) return 255
  return raster.pixels[row * raster.width + column] ?? 255
}

export function rasterMillimeters(raster: Raster, x: number, y: number): number {
  return rasterPoint(raster, x / MM_PER_PT, y / MM_PER_PT)
}

export function rasterCssPixels(raster: Raster, x: number, y: number): number {
  return rasterPoint(raster, x / PX_PER_MM / MM_PER_PT, y / PX_PER_MM / MM_PER_PT)
}

export function rasterPdf(output: string, work: string, file: string, page = 1): Raster {
  const prefix = path.join(work, `${file}-${page}`)
  execFileSync('pdftoppm', ['-r', '72', '-gray', '-f', String(page), '-l', String(page), '-singlefile', path.join(output, `${file}.pdf`), prefix])
  return readPgm(`${prefix}.pgm`)
}
