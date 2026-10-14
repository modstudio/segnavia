export interface PressImage {
  width: number
  height: number
  colorSpace: 'DeviceRGB' | 'CalRGB' | 'ICCBased' | 'Indexed'
}

export interface PressReport {
  /** Authored raster images left in RGB, read back from the finished PDF. */
  images: PressImage[]
  /** CMYK painting and group counts read back from the finished PDF. */
  fills: number
  strokes: number
  gradientStops: number
  /** Function-based shadings rewritten as DeviceCMYK sampled functions. */
  sampledShadings: number
  groups: number
}
