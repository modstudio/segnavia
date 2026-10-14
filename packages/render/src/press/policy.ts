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

export type ColorSpaceLabel = 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK' | 'CalRGB' | 'ICCBased' | 'Indexed' | 'Pattern' | 'missing' | 'other'

export function colorSpaceKind(value: ColorSpaceValue | undefined): ColorSpaceKind {
  if (value?.name === 'DeviceRGB' || value?.name === 'CalRGB') return 'rgb'
  if (value?.name === 'DeviceGray') return 'gray'
  if (value?.name === 'DeviceCMYK') return 'cmyk'
  if (value?.family === 'ICCBased') return value.channels === 3 ? 'rgb' : value.channels === 1 ? 'gray' : value.channels === 4 ? 'cmyk' : 'other'
  if (value?.family === 'Indexed') return colorSpaceKind(value.base)
  return 'other'
}

export function colorSpaceLabel(value: ColorSpaceValue | undefined): ColorSpaceLabel {
  const label = value?.name ?? value?.family
  if (!label) return 'missing'
  return ['DeviceRGB', 'DeviceGray', 'DeviceCMYK', 'CalRGB', 'ICCBased', 'Indexed', 'Pattern'].includes(label) ? (label as ColorSpaceLabel) : 'other'
}

const decision = (action: PolicyDecision['action'], supported: string): PolicyDecision => ({ action, supported })

export interface ContentFilterDecision extends PolicyDecision {
  encoding: 'compressed' | 'none' | 'unsupported'
}

// Content streams are decoded only when they are unfiltered or use the supported compression filter.
export function contentFilter(names: string[] | undefined): ContentFilterDecision {
  const supported = `${'Fl' + 'ateDecode'} or no filter`
  if (!names) return { ...decision('keep', supported), encoding: 'none' }
  if (names.length === 1 && names[0] === 'Fl' + 'ateDecode') return { ...decision('keep', supported), encoding: 'compressed' }
  return { ...decision('refuse', supported), encoding: 'unsupported' }
}

// A mask source keeps RGB because its luminosity or alpha values are interpreted by the mask; other RGB groups become CMYK.
export function groupAction(kind: ColorSpaceKind, label: string, maskSource: boolean): PolicyDecision {
  const supported = 'DeviceCMYK, DeviceGray, DeviceRGB on a mask source, or no declared space'
  if (kind === 'gray' || kind === 'cmyk' || (maskSource && (label === 'DeviceRGB' || label === 'missing'))) return decision('keep', supported)
  if (label === 'missing' || label === 'DeviceRGB') return decision('convert', supported)
  return decision('refuse', supported)
}

// Axial and radial RGB shadings convert by their stops; a type 1 RGB shading converts when its function is a type 4 calculator.
export function shadingAction(kind: ColorSpaceKind, type: number | undefined, functionType?: number): PolicyDecision {
  if (type === 1) {
    const supported = 'ShadingType 1 in an RGB space with FunctionType 4, or DeviceCMYK'
    if (kind === 'cmyk') return decision('keep', supported)
    if (kind === 'rgb' && functionType === 4) return decision('convert', supported)
    return decision('refuse', supported)
  }
  const supported = 'ShadingType 2 or 3 in an RGB or DeviceCMYK color space'
  if (type !== 2 && type !== 3) return decision('refuse', supported)
  if (kind === 'rgb') return decision('convert', supported)
  if (kind === 'cmyk') return decision('keep', supported)
  return decision('refuse', supported)
}

export interface FunctionDecision extends PolicyDecision {
  found: string
}

// A shading function is a type 2 dictionary or a type 3 dictionary with a Functions array.
export function shadingFunctionAction(type: number | undefined, dictionary: boolean, functions: boolean): FunctionDecision {
  if (!dictionary) return { ...decision('refuse', 'FunctionType 2 or 3'), found: 'shading function other' }
  if (type !== 2 && type !== 3) return { ...decision('refuse', 'FunctionType 2 or 3'), found: `shading FunctionType ${type ?? 'missing'}` }
  if (type === 3 && !functions) return { ...decision('refuse', 'a Functions array'), found: 'FunctionType 3 Functions missing' }
  return { ...decision('keep', 'FunctionType 2 or 3'), found: `shading FunctionType ${type}` }
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
export function inlineImageAction(name: string | undefined, imageMask: boolean): PolicyDecision & { kind: ColorSpaceKind; label: ColorSpaceLabel } {
  const value = name ? (inlineNames[name] ?? { name }) : undefined
  const kind = colorSpaceKind(value)
  const supported = 'an image mask, DeviceGray, or DeviceCMYK'
  return { ...decision(imageMask || kind === 'gray' || kind === 'cmyk' ? 'keep' : 'refuse', supported), kind, label: colorSpaceLabel(value) }
}

// Content streams may select only patterns or CMYK explicitly after conversion.
export function contentColorSpaceAction(name: string | undefined): PolicyDecision {
  const supported = 'Pattern or DeviceCMYK'
  return decision(name === 'Pattern' || name === 'DeviceCMYK' ? 'keep' : 'refuse', supported)
}

const colorOperators = ['rg', 'RG', 'g', 'G', 'k', 'K', 'sc', 'SC', 'scn', 'SCN', 'cs', 'CS'] as const
export type ContentColorOperator = (typeof colorOperators)[number]

export function isContentColorOperator(operator: string): operator is ContentColorOperator {
  return colorOperators.includes(operator as ContentColorOperator)
}

// RGB and gray operators convert on rewrite and refuse on read-back; CMYK and a named pattern are the only color forms retained.
export function contentOperatorAction(operator: ContentColorOperator, inspect: boolean, selectedSpace?: string, patternName = false): PolicyDecision {
  if (operator === 'rg' || operator === 'RG' || operator === 'g' || operator === 'G')
    return decision(inspect ? 'refuse' : 'convert', inspect ? 'CMYK operators' : 'RGB or DeviceGray color operands')
  if (operator === 'k' || operator === 'K') return decision('keep', 'four CMYK operands')
  if (operator === 'cs' || operator === 'CS') return contentColorSpaceAction(selectedSpace)
  return decision((operator === 'scn' || operator === 'SCN') && patternName ? 'keep' : 'refuse', 'a pattern name with scn or SCN')
}
