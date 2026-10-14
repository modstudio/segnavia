import { toPress } from '../color/engine.ts'
import type { Color3, Color4, Profile } from '../color/types.ts'

const NEUTRAL_TOLERANCE = 0.001

export function pressColor(profile: Profile, rgb: Color3): Color4 {
  const [red, green, blue] = rgb
  if (Math.max(red, green, blue) - Math.min(red, green, blue) <= NEUTRAL_TOLERANCE) return [0, 0, 0, 1 - red]
  return toPress(profile, rgb)
}

export function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  if (Object.is(rounded, -0)) return '0'
  return rounded.toFixed(6).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '')
}

export function cachedPressColor(profile: Profile): (rgb: Color3) => Color4 {
  const cache = new Map<string, Color4>()
  return (rgb) => {
    const key = rgb.join(',')
    const cached = cache.get(key)
    if (cached) return cached
    const converted = pressColor(profile, rgb)
    cache.set(key, converted)
    return converted
  }
}
