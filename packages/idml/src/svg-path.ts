import type { IdmlArtPlacement, IdmlPoint, IdmlSwatch } from './types.ts'

const rounded = (value: number): string => {
  const result = Number(value.toFixed(2))
  return String(Object.is(result, -0) ? 0 : result)
}

const escapeAttribute = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function point(value: IdmlPoint, origin: IdmlPoint): string {
  return `${rounded(value[0] - origin[0])} ${rounded(value[1] - origin[1])}`
}

function pathData(path: IdmlArtPlacement['polygons'][number]['paths'][number], origin: IdmlPoint): string {
  const first = path.points[0]
  if (!first) return ''
  const output = [`M${point(first.anchor, origin)}`]
  for (let index = 1; index < path.points.length; index += 1) {
    const previous = path.points[index - 1]
    const current = path.points[index]
    if (previous && current) output.push(`C${point(previous.right, origin)} ${point(current.left, origin)} ${point(current.anchor, origin)}`)
  }
  const last = path.points.at(-1)
  if (!path.open && last && path.points.length > 1) output.push(`C${point(last.right, origin)} ${point(first.left, origin)} ${point(first.anchor, origin)}Z`)
  return output.join('')
}

function swatchColor(id: string, swatches: IdmlSwatch[]): string | undefined {
  if (id.endsWith('/None')) return 'none'
  if (id.endsWith('/Black')) return '#000'
  if (id.endsWith('/Paper')) return '#fff'
  const swatch = swatches.find((value) => value.id === id || value.name === id)
  if (swatch?.model === 'rgb' && swatch.values?.length === 3) return `rgb(${swatch.values.join(' ')})`
  if (swatch?.model === 'cmyk' && swatch.values?.length === 4) {
    const [c, m, y, k] = swatch.values.map((value) => value / 100) as [number, number, number, number]
    return `rgb(${Math.round(255 * (1 - c) * (1 - k))} ${Math.round(255 * (1 - m) * (1 - k))} ${Math.round(255 * (1 - y) * (1 - k))})`
  }
  return undefined
}

export interface ArtSvgResult {
  markup: string
  unsupportedStrokes: { name: string; location: string }[]
}

export function artSvg(art: IdmlArtPlacement, swatches: IdmlSwatch[]): ArtSvgResult {
  const width = art.bounds.right - art.bounds.left
  const height = art.bounds.bottom - art.bounds.top
  const origin: IdmlPoint = [art.bounds.left, art.bounds.top]
  const unsupportedStrokes: ArtSvgResult['unsupportedStrokes'] = []
  const paths = art.polygons.flatMap((polygon) => {
    if (polygon.stroke) unsupportedStrokes.push({ name: `StrokeColor:${polygon.stroke.color}`, location: polygon.location })
    const fill = swatchColor(polygon.fill, swatches)
    return polygon.paths.map((path) => `<path d="${escapeAttribute(pathData(path, origin))}" fill="${escapeAttribute(fill ?? 'none')}"/>`)
  })
  return {
    markup: `<svg viewBox="0 0 ${rounded(width)} ${rounded(height)}" width="${rounded(width)}pt" height="${rounded(height)}pt" xmlns="http://www.w3.org/2000/svg">${paths.join('')}</svg>`,
    unsupportedStrokes,
  }
}
