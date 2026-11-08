// Browser geometry is quantized to 1/64 CSS px. Measurements accumulated far
// from the origin can therefore exceed an exact configured length by one unit.
export const LAYOUT_UNIT_PX = 1 / 64

export function measuredExtentFits(extent: number, limit: number): boolean {
  return extent <= limit + LAYOUT_UNIT_PX
}
