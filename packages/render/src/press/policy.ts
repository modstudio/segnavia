import type { PressDestination } from './types.ts'

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

// Supplied gray and CMYK samples already match a CMYK PDF; a greyscale destination profiles gray and RGB samples.
export function imageAction(kind: ColorSpaceKind, destination: PressDestination): PolicyDecision {
  const supported = destination === 'cmyk' ? 'DeviceGray, RGB, or DeviceCMYK' : 'DeviceGray or RGB'
  if (destination === 'cmyk') return decision(kind === 'rgb' ? 'convert' : kind === 'gray' || kind === 'cmyk' ? 'keep' : 'refuse', supported)
  return decision(kind === 'gray' || kind === 'rgb' ? 'convert' : 'refuse', supported)
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

// RGB mask sources stay RGB for CMYK output, while every RGB group becomes DeviceGray for gray output.
export function groupAction(kind: ColorSpaceKind, label: string, maskSource: boolean, destination: PressDestination = 'cmyk'): PolicyDecision {
  if (destination === 'gray') {
    const supported = 'DeviceGray, DeviceRGB, or no declared space'
    if (kind === 'gray') return decision('keep', supported)
    if (label === 'missing' || label === 'DeviceRGB') return decision('convert', supported)
    return decision('refuse', supported)
  }
  const supported = 'DeviceCMYK, DeviceGray, DeviceRGB on a mask source, or no declared space'
  if (kind === 'gray' || kind === 'cmyk' || (maskSource && (label === 'DeviceRGB' || label === 'missing'))) return decision('keep', supported)
  if (label === 'missing' || label === 'DeviceRGB') return decision('convert', supported)
  return decision('refuse', supported)
}

// Axial and radial RGB shadings convert by their stops; a type 1 RGB shading converts when its function is a type 4 calculator.
export function shadingAction(kind: ColorSpaceKind, type: number | undefined, functionType?: number, destination: PressDestination = 'cmyk'): PolicyDecision {
  if (type === 1) {
    const supported = 'ShadingType 1 in an RGB space with FunctionType 4, or DeviceCMYK'
    if (kind === destination) return decision('keep', supported)
    if (kind === 'rgb' && functionType === 4) return decision('convert', supported)
    return decision('refuse', supported)
  }
  const supported = 'ShadingType 2 or 3 in an RGB or DeviceCMYK color space'
  if (type !== 2 && type !== 3) return decision('refuse', supported)
  if (kind === 'rgb') return decision('convert', supported)
  if (kind === destination) return decision('keep', supported)
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

export const REGISTRATION_COLORANT = 'All'

export const isRegistrationColorant = (name: string | undefined): boolean => name === REGISTRATION_COLORANT

// Content streams may select only patterns or CMYK explicitly after conversion.
export function contentColorSpaceAction(name: string | undefined, destination: PressDestination = 'cmyk', registration = false): PolicyDecision {
  const device = destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK'
  const supported = `Pattern or ${device}`
  if (registration) return decision(destination === 'cmyk' ? 'keep' : 'refuse', supported)
  return decision(name === 'Pattern' || name === device ? 'keep' : 'refuse', supported)
}

const colorOperators = ['rg', 'RG', 'g', 'G', 'k', 'K', 'sc', 'SC', 'scn', 'SCN', 'cs', 'CS'] as const
export type ContentColorOperator = (typeof colorOperators)[number]

export function isContentColorOperator(operator: string): operator is ContentColorOperator {
  return colorOperators.includes(operator as ContentColorOperator)
}

function deviceColorAction(operator: ContentColorOperator, inspect: boolean, destination: PressDestination): PolicyDecision | undefined {
  const rgb = operator === 'rg' || operator === 'RG'
  const gray = operator === 'g' || operator === 'G'
  const cmyk = operator === 'k' || operator === 'K'
  if (!rgb && !gray && !cmyk) return undefined
  if (!inspect && (rgb || gray)) return decision('convert', 'RGB or DeviceGray color operands')
  if (destination === 'gray') return decision(gray ? 'keep' : 'refuse', 'RGB or gray input for a greyscale press')
  return decision(cmyk ? 'keep' : 'refuse', 'CMYK operators')
}

export const REGISTRATION_CONVERTED_OPERATORS = ['cs', 'CS', 'sc', 'SC', 'scn', 'SCN'] as const
export type RegistrationConvertedOperator = (typeof REGISTRATION_CONVERTED_OPERATORS)[number]

export function isRegistrationConvertedOperator(operator: string): operator is RegistrationConvertedOperator {
  return (REGISTRATION_CONVERTED_OPERATORS as readonly string[]).includes(operator)
}

function registrationOperatorAction(operator: ContentColorOperator, inspect: boolean, destination: PressDestination): PolicyDecision | undefined {
  if (destination === 'cmyk') return decision('keep', 'Pattern or DeviceCMYK')
  if (isRegistrationConvertedOperator(operator)) return decision(inspect ? 'refuse' : 'convert', 'DeviceGray operators')
  return undefined
}

// RGB and gray operators convert on rewrite and refuse on read-back; CMYK, registration All, and a named pattern are the only color forms retained.
export function contentOperatorAction(
  operator: ContentColorOperator,
  inspect: boolean,
  selectedSpace?: string,
  patternName = false,
  destination: PressDestination = 'cmyk',
  registration = false,
): PolicyDecision {
  const device = deviceColorAction(operator, inspect, destination)
  if (device) return device
  if (registration) {
    const action = registrationOperatorAction(operator, inspect, destination)
    if (action) return action
  }
  if (operator === 'cs' || operator === 'CS') return contentColorSpaceAction(selectedSpace, destination, registration)
  return decision((operator === 'scn' || operator === 'SCN') && patternName ? 'keep' : 'refuse', 'a pattern name with scn or SCN')
}
