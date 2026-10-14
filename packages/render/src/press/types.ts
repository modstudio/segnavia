export interface PressImage {
  width: number
  height: number
  colorSpace: 'DeviceRGB' | 'CalRGB' | 'ICCBased' | 'Indexed'
}

export interface PressReport {
  images: PressImage[]
  fills: number
  strokes: number
  gradientStops: number
  groups: number
}
