export type ColorSpaceKind = 'rgb' | 'gray' | 'cmyk' | 'other'

export interface ColorSpaceValue {
  base?: ColorSpaceValue
  channels?: number
  family?: string
  name?: string
}

export interface PolicyDecision {
  action: 'convert' | 'keep' | 'refuse'
  supported: string
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

const decision = (action: PolicyDecision['action'], supported: string): PolicyDecision => ({ action, supported })

// A mask source keeps RGB because its luminosity or alpha values are interpreted by the mask; other RGB groups become CMYK.
export function groupAction(kind: ColorSpaceKind, label: string, maskSource: boolean): PolicyDecision {
  const supported = 'DeviceCMYK, DeviceGray, DeviceRGB on a mask source, or no declared space'
  if (kind === 'gray' || kind === 'cmyk' || (maskSource && (label === 'DeviceRGB' || label === 'missing'))) return decision('keep', supported)
  if (label === 'missing' || label === 'DeviceRGB') return decision('convert', supported)
  return decision('refuse', supported)
}

// Only axial and radial RGB shadings are converted; already-CMYK shadings need no work.
export function shadingAction(kind: ColorSpaceKind, type: number | undefined): PolicyDecision {
  const supported = 'ShadingType 2 or 3 in an RGB or DeviceCMYK color space'
  if (type !== 2 && type !== 3) return decision('refuse', supported)
  if (kind === 'rgb') return decision('convert', supported)
  if (kind === 'cmyk') return decision('keep', supported)
  return decision('refuse', supported)
}

// Exponential and stitching functions are the gradient functions this rewrite understands.
export function functionAction(type: number | undefined): PolicyDecision {
  const supported = 'FunctionType 2 or 3'
  return decision(type === 2 || type === 3 ? 'keep' : 'refuse', supported)
}

const inlineNames: Record<string, ColorSpaceValue> = {
  G: { name: 'DeviceGray' },
  DeviceGray: { name: 'DeviceGray' },
  RGB: { name: 'DeviceRGB' },
  DeviceRGB: { name: 'DeviceRGB' },
  CMYK: { name: 'DeviceCMYK' },
  DeviceCMYK: { name: 'DeviceCMYK' },
  I: { family: 'Indexed' },
  Indexed: { family: 'Indexed' },
  CalRGB: { name: 'CalRGB' },
}

// Inline images are safe only as masks or in a directly named gray or CMYK space; resource and compound spaces are refused.
export function inlineImageAction(name: string | undefined, imageMask: boolean): PolicyDecision & { kind: ColorSpaceKind } {
  const kind = colorSpaceKind(name ? inlineNames[name] : undefined)
  const supported = 'an image mask, DeviceGray, or DeviceCMYK'
  return { ...decision(imageMask || kind === 'gray' || kind === 'cmyk' ? 'keep' : 'refuse', supported), kind }
}

// Content streams may select only patterns or CMYK explicitly after conversion.
export function contentColorSpaceAction(name: string | undefined): PolicyDecision {
  const supported = 'Pattern or DeviceCMYK'
  return decision(name === 'Pattern' || name === 'DeviceCMYK' ? 'keep' : 'refuse', supported)
}
