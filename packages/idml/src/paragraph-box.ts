import { formatRoundedNumber, logicalCornerRadii } from './positioned-box.ts'
import type { ReportCollector } from './report.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import type { IdmlSwatch } from './types.ts'

type Direction = 'ltr' | 'rtl'

interface ParagraphBoxOptions {
  values: Record<string, string>
  mapped: Set<string>
  resetShading: boolean
  direction: Direction
  swatches: IdmlSwatch[]
  report: ReportCollector
  unsupported: Map<string, number>
  location: string
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function number(values: Record<string, string>, mapped: Set<string>, name: string): number | undefined {
  if (!mapped.has(name)) return undefined
  const value = Number(values[name])
  return Number.isFinite(value) ? value : undefined
}

function points(output: string[], property: string, value: number): void {
  output.push(`${property}:${formatRoundedNumber(value)}pt`)
}

function optionalPoints(output: string[], property: string, value: number | undefined, scale = 1): void {
  if (value !== undefined) points(output, property, value * scale)
}

function combinedPoints(output: string[], property: string, base: number | undefined, adjustment: number | undefined, scale = 1): void {
  if (base === undefined && adjustment === undefined) return
  points(output, property, (base ?? 0) + (adjustment ?? 0) * scale)
}

function padding(
  options: ParagraphBoxOptions,
  output: string[],
  property: string,
  base: number | undefined,
  offset: number | undefined,
  offsetName: string,
): void {
  if (base === undefined && offset === undefined) return
  const value = (base ?? 0) + (offset ?? 0)
  if (value < 0) options.report.add(options.unsupported, offsetName, options.location)
  points(output, property, Math.max(0, value))
}

function boxDeclarations(options: ParagraphBoxOptions, shaded: boolean, reset: boolean, output: string[]): void {
  const { values, mapped, direction } = options
  const top = shaded ? number(values, mapped, 'ParagraphShadingTopOffset') : undefined
  const bottom = shaded ? number(values, mapped, 'ParagraphShadingBottomOffset') : undefined
  const left = shaded ? number(values, mapped, 'ParagraphShadingLeftOffset') : undefined
  const right = shaded ? number(values, mapped, 'ParagraphShadingRightOffset') : undefined
  const before = number(values, mapped, 'SpaceBefore')
  const after = number(values, mapped, 'SpaceAfter')
  const startIndent = number(values, mapped, direction === 'rtl' ? 'RightIndent' : 'LeftIndent')
  const endIndent = number(values, mapped, direction === 'rtl' ? 'LeftIndent' : 'RightIndent')
  const startOffset = direction === 'rtl' ? right : left
  const endOffset = direction === 'rtl' ? left : right
  const startOffsetName = direction === 'rtl' ? 'ParagraphShadingRightOffset' : 'ParagraphShadingLeftOffset'
  const endOffsetName = direction === 'rtl' ? 'ParagraphShadingLeftOffset' : 'ParagraphShadingRightOffset'

  if (reset) {
    points(output, 'margin-block-start', before ?? 0)
    points(output, 'margin-block-end', after ?? 0)
    points(output, 'padding-block-start', 0)
    points(output, 'padding-block-end', 0)
    points(output, 'padding-inline-start', Math.max(0, startIndent ?? 0))
    points(output, 'padding-inline-end', Math.max(0, endIndent ?? 0))
    points(output, 'margin-inline-start', 0)
    points(output, 'margin-inline-end', 0)
    return
  }

  combinedPoints(output, 'margin-block-start', before, top, -1)
  combinedPoints(output, 'margin-block-end', after, bottom, -1)
  padding(options, output, 'padding-block-start', undefined, top, 'ParagraphShadingTopOffset')
  padding(options, output, 'padding-block-end', undefined, bottom, 'ParagraphShadingBottomOffset')
  padding(options, output, 'padding-inline-start', startIndent, startOffset, startOffsetName)
  padding(options, output, 'padding-inline-end', endIndent, endOffset, endOffsetName)
  optionalPoints(output, 'margin-inline-start', startOffset, -1)
  optionalPoints(output, 'margin-inline-end', endOffset, -1)
}

const PHYSICAL_CORNERS = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'] as const

function cornerDeclarations(options: ParagraphBoxOptions, output: string[]): void {
  const { values, mapped, direction, report, unsupported, location } = options
  const radii: Record<'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight', number | undefined> = {
    topLeft: undefined,
    topRight: undefined,
    bottomLeft: undefined,
    bottomRight: undefined,
  }
  for (const physical of PHYSICAL_CORNERS) {
    const optionName = `ParagraphShading${physical}CornerOption`
    const option = values[optionName]
    if (!option || option === 'None' || option.endsWith('/None')) continue
    if (option !== 'RoundedCorner' && !option.endsWith('/RoundedCorner')) {
      report.add(unsupported, optionName, location)
      continue
    }
    const radius = number(values, mapped, `ParagraphShading${physical}CornerRadius`)
    if (radius !== undefined) radii[`${physical[0]?.toLowerCase()}${physical.slice(1)}` as keyof typeof radii] = radius
  }
  for (const [property, radius] of Object.entries(logicalCornerRadii(radii, direction))) {
    if (radius !== undefined) points(output, property, radius)
  }
}

function reportUnmappedOptions(options: ParagraphBoxOptions): void {
  const { values, report, unsupported, location } = options
  if (values.ParagraphShadingWidth && !['ColumnWidth', 'Column'].includes(values.ParagraphShadingWidth)) {
    report.add(unsupported, 'ParagraphShadingWidth', location)
  }
  if (values.ParagraphShadingTopOrigin && !['Ascent', 'AscentTopOrigin'].includes(values.ParagraphShadingTopOrigin)) {
    report.add(unsupported, 'ParagraphShadingTopOrigin', location)
  }
  if (values.ParagraphShadingBottomOrigin && !['Descent', 'DescentBottomOrigin'].includes(values.ParagraphShadingBottomOrigin)) {
    report.add(unsupported, 'ParagraphShadingBottomOrigin', location)
  }
  if (enabled(values.ParagraphShadingClipToFrame)) report.add(unsupported, 'ParagraphShadingClipToFrame', location)
  if (enabled(values.ParagraphShadingSuppressPrinting)) report.add(unsupported, 'ParagraphShadingSuppressPrinting', location)
}

export function paragraphBoxDeclarations(options: ParagraphBoxOptions): string[] {
  const { values, swatches, report, unsupported, location } = options
  const output: string[] = []
  const shaded = enabled(values.ParagraphShadingOn)
  boxDeclarations(options, shaded, options.resetShading, output)
  if (options.resetShading) {
    output.push('background-color:transparent')
    for (const property of Object.keys(logicalCornerRadii({ topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }, options.direction))) {
      points(output, property, 0)
    }
  }
  if (!shaded) return output

  if (!values.ParagraphShadingColor) report.add(unsupported, 'ParagraphShadingColor', location)
  const color = values.ParagraphShadingColor
    ? resolveSwatchColor(values.ParagraphShadingColor, swatches, report, location, 'text', 'ParagraphShadingColor')
    : undefined
  if (color) {
    const tint = Number(values.ParagraphShadingTint)
    output.push(`background-color:${Number.isFinite(tint) && tint >= 0 && tint < 100 ? `color-mix(in srgb, ${color} ${tint}%, #fff)` : color}`)
  }
  cornerDeclarations(options, output)
  reportUnmappedOptions(options)
  return output
}
