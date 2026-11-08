// Browser geometry is quantized to 1/64 CSS px. Measurements accumulated far
// from the origin can therefore exceed an exact configured length by one unit.
export const LAYOUT_UNIT_PX = 1 / 64

export function measuredExtentFits(extent: number, limit: number): boolean {
  // Keep the named unit inside this serialized function as well as exported
  // for callers: bundled Function#toString output cannot retain module scope.
  const layoutUnitPx = 1 / 64
  return extent <= limit + layoutUnitPx
}
