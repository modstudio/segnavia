export interface PressImage {
  width: number
  height: number
  colorSpace: 'DeviceRGB' | 'CalRGB' | 'ICCBased' | 'Indexed'
}

export interface PressReport {
  /** Device colour space written for press-ready vector and generated-image output. */
  destination: 'cmyk' | 'gray'
  /** Authored raster images left in RGB, read back from the finished PDF. */
  images: PressImage[]
  /** Destination-space painting and group counts read back from the finished PDF. */
  fills: number
  strokes: number
  gradientStops: number
  /** Function-based shadings rewritten as sampled functions in the destination space. */
  sampledShadings: number
  groups: number
  /** Color conversions snapped to black ink by the configured tolerance but not by the exact-neutral rule. */
  neutralColors: number
}
