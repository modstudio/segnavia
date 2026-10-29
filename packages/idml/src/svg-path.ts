import { formatRoundedNumber } from './positioned-box.ts'
import type { ReportCollector } from './report.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import type { IdmlArtPlacement, IdmlPoint, IdmlSwatch } from './types.ts'

const escapeAttribute = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function point(value: IdmlPoint, origin: IdmlPoint): string {
  return `${formatRoundedNumber(value[0] - origin[0])} ${formatRoundedNumber(value[1] - origin[1])}`
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

export function artSvg(art: IdmlArtPlacement, swatches: IdmlSwatch[], positionStyle: string, report: ReportCollector): string {
  const width = art.bounds.right - art.bounds.left
  const height = art.bounds.bottom - art.bounds.top
  const origin: IdmlPoint = [art.bounds.left, art.bounds.top]
  const paths = art.polygons.flatMap((polygon) => {
    if (polygon.stroke) report.add(report.unsupportedStyleProperties, `StrokeColor:${polygon.stroke.color}`, polygon.location)
    const fill = resolveSwatchColor(polygon.fill, swatches, report, polygon.location, 'fill') ?? 'currentColor'
    return polygon.paths.map((path) => `<path d="${escapeAttribute(pathData(path, origin))}" fill="${escapeAttribute(fill)}"/>`)
  })
  return `<svg style="${escapeAttribute(positionStyle)}" viewBox="0 0 ${formatRoundedNumber(width)} ${formatRoundedNumber(height)}" width="${formatRoundedNumber(width)}pt" height="${formatRoundedNumber(height)}pt" xmlns="http://www.w3.org/2000/svg">${paths.join('')}</svg>`
}
