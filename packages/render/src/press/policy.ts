export type ColorSpaceKind = 'rgb' | 'gray' | 'cmyk' | 'other'

export interface ColorSpaceValue {
  base?: ColorSpaceValue
  channels?: number
  family?: string
  name?: string
}

export function colorSpaceKind(value: ColorSpaceValue | undefined): ColorSpaceKind {
  if (value?.name === 'DeviceRGB' || value?.name === 'CalRGB') return 'rgb'
  if (value?.name === 'DeviceGray') return 'gray'
  if (value?.name === 'DeviceCMYK') return 'cmyk'
  if (value?.family === 'ICCBased') return value.channels === 3 ? 'rgb' : value.channels === 1 ? 'gray' : value.channels === 4 ? 'cmyk' : 'other'
  if (value?.family === 'Indexed') return colorSpaceKind(value.base)
  return 'other'
}

export function contentFilter(names: string[] | undefined): 'compressed' | 'none' | 'unsupported' {
  if (!names) return 'none'
  return names.length === 1 && names[0] === 'Fl' + 'ateDecode' ? 'compressed' : 'unsupported'
}
