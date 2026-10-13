import { proof } from './engine.ts'
import { srgbToLab } from './spaces.ts'
import type { Color3, Profile } from './types.ts'

export function outOfGamut(profile: Profile, rgb: Color3, tolerance: number): boolean {
  return deltaE2000(srgbToLab(rgb), srgbToLab(proof(profile, rgb))) > tolerance
}

export function deltaE2000(a: Color3, b: Color3): number {
  const [l1, a1, b1] = a,
    [l2, a2, b2] = b
  const c1 = Math.hypot(a1, b1),
    c2 = Math.hypot(a2, b2),
    meanC = (c1 + c2) / 2
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)))
  const ap1 = (1 + g) * a1,
    ap2 = (1 + g) * a2,
    cp1 = Math.hypot(ap1, b1),
    cp2 = Math.hypot(ap2, b2)
  const hue = (x: number, y: number) => {
    const value = (Math.atan2(y, x) * 180) / Math.PI
    return value < 0 ? value + 360 : value
  }
  const h1 = hue(ap1, b1),
    h2 = hue(ap2, b2),
    dl = l2 - l1,
    dc = cp2 - cp1,
    dh0 = h2 - h1
  const dh = cp1 * cp2 === 0 ? 0 : Math.abs(dh0) <= 180 ? dh0 : dh0 > 180 ? dh0 - 360 : dh0 + 360
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(((dh / 2) * Math.PI) / 180)
  const meanL = (l1 + l2) / 2,
    meanCp = (cp1 + cp2) / 2
  const meanH = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2
  const t =
    1 -
    0.17 * Math.cos(((meanH - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * meanH * Math.PI) / 180) +
    0.32 * Math.cos(((3 * meanH + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * meanH - 63) * Math.PI) / 180)
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2),
    sc = 1 + 0.045 * meanCp,
    sh = 1 + 0.015 * meanCp * t
  const rt = -2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7)) * Math.sin((60 * Math.exp(-(((meanH - 275) / 25) ** 2)) * Math.PI) / 180)
  return Math.sqrt((dl / sl) ** 2 + (dc / sc) ** 2 + (dH / sh) ** 2 + rt * (dc / sc) * (dH / sh))
}
