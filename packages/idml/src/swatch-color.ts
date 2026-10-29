import type { ReportCollector } from './report.ts'
import type { IdmlSwatch } from './types.ts'

export type SwatchUse = 'text' | 'fill'

const colorComponent = (value: number): number => Math.round(value + 1e-9)

function unresolved(id: string, location: string, use: SwatchUse, report: ReportCollector, property: string): string | undefined {
  report.add(report.unsupportedStyleProperties, `${property}:${id}`, location)
  return use === 'fill' ? 'currentColor' : undefined
}

export function resolveSwatchColor(
  id: string | undefined,
  swatches: IdmlSwatch[],
  report: ReportCollector,
  location: string,
  use: SwatchUse,
  property = 'FillColor',
): string | undefined {
  if (!id || id.endsWith('/None') || id === 'None') return use === 'fill' ? 'none' : undefined
  if (id.endsWith('/Black') || id === 'Black') return '#000'
  if (id.endsWith('/Paper') || id === 'Paper') return '#fff'
  const swatch = swatches.find((value) => value.id === id || value.name === id)
  if (!swatch) return unresolved(id, location, use, report, property)
  if (swatch.model === 'spot') {
    report.add(report.spotColors, swatch.name, location)
    return use === 'fill' ? 'currentColor' : undefined
  }
  if (swatch.model === 'rgb' && swatch.values?.length === 3) {
    return `rgb(${swatch.values.map(colorComponent).join(' ')})`
  }
  if (swatch.model === 'cmyk' && swatch.values?.length === 4) {
    const [c, m, y, k] = swatch.values.map((value) => value / 100) as [number, number, number, number]
    return `rgb(${colorComponent(255 * (1 - c) * (1 - k))} ${colorComponent(255 * (1 - m) * (1 - k))} ${colorComponent(255 * (1 - y) * (1 - k))})`
  }
  return unresolved(id, location, use, report, property)
}
