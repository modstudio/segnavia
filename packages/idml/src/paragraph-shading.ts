import type { ReportCollector } from './report.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import type { IdmlSwatch } from './types.ts'

type Direction = 'ltr' | 'rtl'

interface ParagraphShadingOptions {
  values: Record<string, string>
  mapped: Set<string>
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
  output.push(`${property}:${Object.is(value, -0) ? 0 : value}pt`)
}

function optionalPoints(output: string[], property: string, value: number | undefined, scale = 1): void {
  if (value !== undefined) points(output, property, value * scale)
}

function combinedPoints(output: string[], property: string, base: number | undefined, adjustment: number | undefined, scale = 1): void {
  if (base === undefined && adjustment === undefined) return
  points(output, property, (base ?? 0) + (adjustment ?? 0) * scale)
}

function boxDeclarations(values: Record<string, string>, mapped: Set<string>, direction: Direction, shaded: boolean, output: string[]): void {
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

  combinedPoints(output, 'margin-block-start', before, top, -1)
  combinedPoints(output, 'margin-block-end', after, bottom, -1)
  optionalPoints(output, 'padding-block-start', top)
  optionalPoints(output, 'padding-block-end', bottom)
  combinedPoints(output, 'padding-inline-start', startIndent, startOffset)
  combinedPoints(output, 'padding-inline-end', endIndent, endOffset)
  optionalPoints(output, 'margin-inline-start', startOffset, -1)
  optionalPoints(output, 'margin-inline-end', endOffset, -1)
}

const CORNERS = [
  ['TopLeft', 'start', 'start'],
  ['TopRight', 'start', 'end'],
  ['BottomLeft', 'end', 'start'],
  ['BottomRight', 'end', 'end'],
] as const

function cornerDeclarations(options: ParagraphShadingOptions, output: string[]): void {
  const { values, mapped, direction, report, unsupported, location } = options
  for (const [physical, block, ltrInline] of CORNERS) {
    const optionName = `ParagraphShading${physical}CornerOption`
    const option = values[optionName]
    if (!option || option === 'None' || option.endsWith('/None')) continue
    if (option !== 'RoundedCorner' && !option.endsWith('/RoundedCorner')) {
      report.add(unsupported, optionName, location)
      continue
    }
    const radius = number(values, mapped, `ParagraphShading${physical}CornerRadius`)
    if (radius === undefined) continue
    const inline = direction === 'rtl' ? (ltrInline === 'start' ? 'end' : 'start') : ltrInline
    points(output, `border-${block}-${inline}-radius`, radius)
  }
}

function reportUnmappedOptions(options: ParagraphShadingOptions): void {
  const { values, report, unsupported, location } = options
  if (values.ParagraphShadingWidth === 'Text') report.add(unsupported, 'ParagraphShadingWidth', location)
  if (values.ParagraphShadingTopOrigin && !['Ascent', 'AscentTopOrigin'].includes(values.ParagraphShadingTopOrigin)) {
    report.add(unsupported, 'ParagraphShadingTopOrigin', location)
  }
  if (values.ParagraphShadingBottomOrigin && !['Descent', 'DescentBottomOrigin'].includes(values.ParagraphShadingBottomOrigin)) {
    report.add(unsupported, 'ParagraphShadingBottomOrigin', location)
  }
  if (enabled(values.ParagraphShadingClipToFrame)) report.add(unsupported, 'ParagraphShadingClipToFrame', location)
  if (enabled(values.ParagraphShadingSuppressPrinting)) report.add(unsupported, 'ParagraphShadingSuppressPrinting', location)
}

export function paragraphBoxDeclarations(options: ParagraphShadingOptions): string[] {
  const { values, mapped, swatches, report, location } = options
  const output: string[] = []
  const shaded = enabled(values.ParagraphShadingOn)
  boxDeclarations(values, mapped, options.direction, shaded, output)
  if (!shaded) return output

  const color = resolveSwatchColor(values.ParagraphShadingColor, swatches, report, location, 'text')
  if (color) {
    const tint = Number(values.ParagraphShadingTint)
    output.push(`background-color:${Number.isFinite(tint) && tint >= 0 && tint < 100 ? `color-mix(in srgb, ${color} ${tint}%, #fff)` : color}`)
  }
  cornerDeclarations(options, output)
  reportUnmappedOptions(options)
  return output
}
