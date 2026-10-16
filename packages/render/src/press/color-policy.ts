import { toPress } from '../color/engine.ts'
import type { Color3, Color4, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'

const NEUTRAL_TOLERANCE = 0.001
export const DEFAULT_NEUTRAL_TOLERANCE = 3

export function assertNeutralTolerance(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 255)
    throw new RenderRefusedError(`The press neutral tolerance is ${String(value)}; supported: a finite number from 0 to 255.`)
}

// The exact-grey rule is a floor: any tolerance accepts every color it accepts.
export function snapsToNeutral(rgb: Color3, tolerance: number): boolean {
  const spread = Math.max(...rgb) - Math.min(...rgb)
  return spread <= Math.max(NEUTRAL_TOLERANCE, tolerance / 255) + Number.EPSILON
}

// A color snapped by the configured tolerance that the exact-grey rule alone would not snap.
export function newlySnapsToNeutral(rgb: Color3, tolerance: number): boolean {
  return snapsToNeutral(rgb, tolerance) && !snapsToNeutral(rgb, 0)
}

export function pressColor(profile: Profile, rgb: Color3, tolerance = DEFAULT_NEUTRAL_TOLERANCE): Color4 {
  const [red, green, blue] = rgb
  if (snapsToNeutral(rgb, tolerance)) return [0, 0, 0, 1 - (red === green && green === blue ? red : (red + green + blue) / 3)]
  return toPress(profile, rgb)
}

export function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  if (Object.is(rounded, -0)) return '0'
  return rounded.toFixed(6).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '')
}

export function cachedPressColor(profile: Profile, tolerance = DEFAULT_NEUTRAL_TOLERANCE): (rgb: Color3) => Color4 {
  const cache = new Map<string, Color4>()
  return (rgb) => {
    const key = `${tolerance}:${rgb.join(',')}`
    const cached = cache.get(key)
    if (cached) return cached
    const converted = pressColor(profile, rgb, tolerance)
    cache.set(key, converted)
    return converted
  }
}
