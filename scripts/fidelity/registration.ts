import type { Box, RegistrationMeasurement } from './types.ts'

export interface ProfileMatch {
  best: number
  residual: number
  residual0: number
}

function clampBox(box: Box, width: number, height: number): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor(box.x)),
    y0: Math.max(0, Math.floor(box.y)),
    x1: Math.min(width, Math.ceil(box.x + box.width)),
    y1: Math.min(height, Math.ceil(box.y + box.height)),
  }
}

function pixelInk(pixels: Uint8Array, offset: number): number {
  return 765 - (pixels[offset] ?? 0) - (pixels[offset + 1] ?? 0) - (pixels[offset + 2] ?? 0)
}

export function rowInk(pixels: Uint8Array, width: number, height: number, box: Box): Float64Array {
  const { x0, y0, x1, y1 } = clampBox(box, width, height)
  const ink = new Float64Array(height)
  for (let y = y0; y < y1; y++) {
    let sum = 0
    for (let x = x0; x < x1; x++) sum += pixelInk(pixels, (y * width + x) * 3)
    ink[y] = sum
  }
  return ink
}

export function columnInk(pixels: Uint8Array, width: number, height: number, box: Box): Float64Array {
  const { x0, y0, x1, y1 } = clampBox(box, width, height)
  const ink = new Float64Array(width)
  for (let x = x0; x < x1; x++) {
    let sum = 0
    for (let y = y0; y < y1; y++) sum += pixelInk(pixels, (y * width + x) * 3)
    ink[x] = sum
  }
  return ink
}

export function bestProfileShift(left: Float64Array, right: Float64Array, start: number, end: number, limit: number): ProfileMatch {
  const residualAt = (shift: number): number => {
    let l1 = 0
    let denom = 0
    for (let i = start; i < end; i++) {
      const other = i + shift
      if (other < start || other >= end) continue
      const a = left[i] ?? 0
      const b = right[other] ?? 0
      l1 += Math.abs(a - b)
      denom += a + b
    }
    return denom === 0 ? 0 : l1 / denom
  }
  const residual0 = residualAt(0)
  let best = 0
  let residual = residual0
  for (let shift = -limit; shift <= limit; shift++) {
    const value = residualAt(shift)
    if (value < residual) {
      residual = value
      best = shift
    }
  }
  return { best, residual, residual0 }
}

export function profileMatchPasses(match: ProfileMatch, tolerance: number, residualMax: number): boolean {
  return Math.abs(match.best) <= tolerance && match.residual0 <= residualMax
}

export function registrationPasses(measured: RegistrationMeasurement, tolerance: number, residualMax: number): boolean {
  return (
    profileMatchPasses({ best: measured.dy, residual: measured.residual, residual0: measured.residual0 }, tolerance, residualMax) &&
    profileMatchPasses({ best: measured.dx, residual: measured.residualX, residual0: measured.residualX0 }, tolerance, residualMax)
  )
}

export function formatRegistration(measured: RegistrationMeasurement | undefined): string {
  if (!measured) return 'dy —, nL1@0 —; dx —, nL1@0 —'
  return `dy ${measured.dy}, nL1@0 ${measured.residual0.toFixed(4)}; dx ${measured.dx}, nL1@0 ${measured.residualX0.toFixed(4)}`
}

export function worstRegistration(items: RegistrationMeasurement[]): RegistrationMeasurement | undefined {
  if (!items.length) return undefined
  return items.reduce((worst, next) => ({
    dy: Math.abs(next.dy) >= Math.abs(worst.dy) ? next.dy : worst.dy,
    residual: Math.max(worst.residual, next.residual),
    residual0: Math.max(worst.residual0, next.residual0),
    dx: Math.abs(next.dx) >= Math.abs(worst.dx) ? next.dx : worst.dx,
    residualX: Math.max(worst.residualX, next.residualX),
    residualX0: Math.max(worst.residualX0, next.residualX0),
  }))
}

export function measureRegistration(left: Uint8Array, right: Uint8Array, width: number, height: number, box: Box, search: number): RegistrationMeasurement {
  const area = clampBox(box, width, height)
  if (area.x1 <= area.x0 || area.y1 <= area.y0) {
    throw new Error(`The body text window ${box.x},${box.y} ${box.width}×${box.height} does not overlap the ${width}×${height} raster.`)
  }
  const screenRows = rowInk(left, width, height, box)
  const screenColumns = columnInk(left, width, height, box)
  if (screenRows.every((value) => value === 0) && screenColumns.every((value) => value === 0)) {
    throw new Error(`The body text window ${box.x},${box.y} ${box.width}×${box.height} has no ink in the screen raster.`)
  }
  const y0 = Math.floor(box.y)
  const y1 = Math.ceil(box.y + box.height)
  const x0 = Math.floor(box.x)
  const x1 = Math.ceil(box.x + box.width)
  const row = bestProfileShift(screenRows, rowInk(right, width, height, box), y0, y1, search)
  const column = bestProfileShift(screenColumns, columnInk(right, width, height, box), x0, x1, search)
  return {
    dy: row.best,
    residual: row.residual,
    residual0: row.residual0,
    dx: column.best,
    residualX: column.residual,
    residualX0: column.residual0,
  }
}
