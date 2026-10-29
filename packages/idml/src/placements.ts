import { type AnyNode, type Element, isTag } from 'domhandler'
import { framePreference } from './frame-preferences.ts'
import type { ReportCollector } from './report.ts'
import type { IdmlBounds, IdmlFramePreference, IdmlPage, IdmlPolygon, IdmlUnmappedPlacement } from './types.ts'
import { GRAPHIC_ELEMENTS, SHAPE_ELEMENTS } from './unsupported-elements.ts'
import { attribute, elements, localName } from './xml.ts'

type Transform = [number, number, number, number, number, number]
type Point = [number, number]
const IDENTITY: Transform = [1, 0, 0, 1, 0, 0]

export function itemTransform(value: string | undefined): Transform {
  const values = (value ?? '').trim().split(/\s+/).map(Number)
  return values.length === 6 && values.every(Number.isFinite) ? (values as Transform) : IDENTITY
}

function transform(element: Element): Transform {
  return itemTransform(attribute(element, 'ItemTransform'))
}

function compose(parent: Transform, child: Transform): Transform {
  const [a, b, c, d, x, y] = parent
  const [e, f, g, h, u, v] = child
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y]
}

export function applyTransform(value: Transform, point: Point): Point {
  return [value[0] * point[0] + value[2] * point[1] + value[4], value[1] * point[0] + value[3] * point[1] + value[5]]
}

export function pointValue(value: string | undefined, fallback?: Point): Point | undefined {
  const values = (value ?? '').trim().split(/\s+/).map(Number)
  return values.length === 2 && values.every(Number.isFinite) ? (values as Point) : fallback
}

export function pageArea(element: Element): Point[] | undefined {
  const value = (attribute(element, 'GeometricBounds') ?? '').trim().split(/\s+/).map(Number)
  if (value.length !== 4 || !value.every(Number.isFinite)) return undefined
  const [top, left, bottom, right] = value as [number, number, number, number]
  const matrix = transform(element)
  return [
    applyTransform(matrix, [left, top]),
    applyTransform(matrix, [right, top]),
    applyTransform(matrix, [right, bottom]),
    applyTransform(matrix, [left, bottom]),
  ]
}

export function placementBounds(points: Point[]): IdmlBounds | undefined {
  if (points.length === 0) return undefined
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

function frameBounds(element: Element, matrix: Transform): IdmlBounds | undefined {
  const anchors = elements(element)
    .map((candidate) => attribute(candidate, 'Anchor'))
    .filter((value): value is string => value !== undefined)
    .map((value) => value.trim().split(/\s+/).map(Number))
    .filter((value): value is Point => value.length === 2 && value.every(Number.isFinite))
    .map((point) => applyTransform(matrix, point))
  return placementBounds(anchors)
}

export function contains(area: Point[], [x, y]: Point): boolean {
  let inside = false
  for (let index = 0, previous = area.length - 1; index < area.length; previous = index, index += 1) {
    const [xi, yi] = area[index] as Point
    const [xj, yj] = area[previous] as Point
    if (yi === yj && y === yi && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) return true
    if (yi > y !== yj > y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export interface FramePlacement {
  id: string
  story: string
  bounds?: IdmlBounds
  center?: Point
  preference?: IdmlFramePreference
  location: string
}

interface PolygonPlacement {
  polygon: IdmlPolygon
  bounds: IdmlBounds
  center: Point
  group: string
}
interface LinkPlacement {
  bounds?: IdmlBounds
  center?: Point
  uri: string
  location: string
}
interface UnmappedPlacement extends IdmlUnmappedPlacement {
  center?: Point
}
export interface SpreadPlacements {
  frames: FramePlacement[]
  polygons: PolygonPlacement[]
  links: LinkPlacement[]
  unmapped: UnmappedPlacement[]
}

function centered(box: IdmlBounds): Point {
  return [(box.left + box.right) / 2, (box.top + box.bottom) / 2]
}

function framePlacement(element: Element, matrix: Transform, location: string): FramePlacement | undefined {
  const story = attribute(element, 'ParentStory')
  if (!story) return undefined
  const box = frameBounds(element, matrix)
  const preference = framePreference(element, location)
  return {
    id: attribute(element, 'Self') ?? story,
    story,
    ...(box ? { bounds: box, center: centered(box) } : {}),
    ...(preference ? { preference } : {}),
    location,
  }
}

function pointAttribute(element: Element, name: string, fallback?: Point): Point | undefined {
  return pointValue(attribute(element, name), fallback)
}

function polygonPlacement(element: Element, matrix: Transform, location: string, group: string): PolygonPlacement | undefined {
  const paths = elements(element, 'GeometryPathType').flatMap((path) => {
    const points = elements(path, 'PathPointType').flatMap((candidate) => {
      const anchor = pointAttribute(candidate, 'Anchor')
      return anchor
        ? [
            {
              anchor: applyTransform(matrix, anchor),
              left: applyTransform(matrix, pointAttribute(candidate, 'LeftDirection', anchor) as Point),
              right: applyTransform(matrix, pointAttribute(candidate, 'RightDirection', anchor) as Point),
            },
          ]
        : []
    })
    return points.length > 0 ? [{ open: attribute(path, 'PathOpen') === 'true', points }] : []
  })
  const box = placementBounds(paths.flatMap((path) => path.points.flatMap((point) => [point.anchor, point.left, point.right])))
  if (!box) return undefined
  const weight = Number(attribute(element, 'StrokeWeight'))
  const color = attribute(element, 'StrokeColor')
  return {
    polygon: {
      paths,
      fill: attribute(element, 'FillColor') ?? 'Swatch/None',
      ...(Number.isFinite(weight) && weight > 0 && color && !color.endsWith('/None') ? { stroke: { color, weight } } : {}),
      location,
    },
    bounds: box,
    center: centered(box),
    group,
  }
}

function linkedUri(element: Element): string | undefined {
  const graphic = elements(element).find((candidate) => (GRAPHIC_ELEMENTS as readonly string[]).includes(localName(candidate.name)))
  return graphic
    ? elements(graphic, 'Link')
        .map((link) => attribute(link, 'LinkResourceURI'))
        .find((uri): uri is string => Boolean(uri))
    : undefined
}

function collectShape(result: SpreadPlacements, element: Element, name: string, matrix: Transform, location: string, group?: string): void {
  const box = frameBounds(element, matrix)
  const uri = linkedUri(element)
  if (uri) result.links.push({ ...(box ? { bounds: box, center: centered(box) } : {}), uri, location })
  else if (name === 'Polygon') {
    const polygon = polygonPlacement(element, matrix, location, group ?? attribute(element, 'Self') ?? location)
    if (polygon) result.polygons.push(polygon)
    else result.unmapped.push({ name, location, ...(box ? { center: centered(box) } : {}) })
  } else result.unmapped.push({ name, location, ...(box ? { center: centered(box) } : {}) })
}

function collectTerminal(result: SpreadPlacements, element: Element, name: string, matrix: Transform, location: string, group?: string): boolean {
  if (name === 'TextFrame') {
    const frame = framePlacement(element, matrix, location)
    if (frame) result.frames.push(frame)
    return true
  }
  if ((SHAPE_ELEMENTS as readonly string[]).includes(name)) {
    collectShape(result, element, name, matrix, location, group)
    return true
  }
  return false
}

export function spreadPlacements(spread: Element, location: string): SpreadPlacements {
  const result: SpreadPlacements = { frames: [], polygons: [], links: [], unmapped: [] }
  let sequence = 0
  const pending = [...spread.children].reverse().map((node) => ({ node, matrix: IDENTITY, group: undefined as string | undefined }))
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || !isTag(current.node)) continue
    const name = localName(current.node.name)
    if (name === 'Page' || name === 'Spread' || name === 'MasterSpread') continue
    const matrix = ['Group', 'TextFrame', ...SHAPE_ELEMENTS].includes(name) ? compose(current.matrix, transform(current.node)) : current.matrix
    const itemLocation = `${location}#${name}[${++sequence}]`
    const group = name === 'Group' ? (current.group ?? attribute(current.node, 'Self') ?? itemLocation) : current.group
    if (collectTerminal(result, current.node, name, matrix, itemLocation, group)) continue
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) pending.push({ node: current.node.children[index] as AnyNode, matrix, group })
  }
  return result
}

const relativeBounds = (value: IdmlBounds, area: IdmlBounds): IdmlBounds => ({
  left: value.left - area.left,
  top: value.top - area.top,
  right: value.right - area.left,
  bottom: value.bottom - area.top,
})

function relativePolygon(polygon: IdmlPolygon, area: IdmlBounds): IdmlPolygon {
  const relative = ([x, y]: Point): Point => [x - area.left, y - area.top]
  return {
    ...polygon,
    paths: polygon.paths.map((path) => ({
      ...path,
      points: path.points.map((point) => ({ anchor: relative(point.anchor), left: relative(point.left), right: relative(point.right) })),
    })),
  }
}

function placeFrames(frames: FramePlacement[], pageIndex: (center?: Point) => number, areas: (IdmlBounds | undefined)[], pages: IdmlPage[]): void {
  for (const frame of frames) {
    const index = pageIndex(frame.center)
    const area = areas[index]
    const page = pages[index]
    if (!area || !page || !frame.bounds) continue
    page.bodyFrames = [...(page.bodyFrames ?? []), { story: frame.story, bounds: relativeBounds(frame.bounds, area), location: frame.location }]
  }
}

function placeArt(polygons: PolygonPlacement[], pageIndex: (center?: Point) => number, areas: (IdmlBounds | undefined)[], pages: IdmlPage[]): void {
  const groups = new Map<string, { index: number; polygons: IdmlPolygon[]; boxes: IdmlBounds[]; location: string }>()
  for (const item of polygons) {
    const index = pageIndex(item.center)
    const area = areas[index]
    if (!area || !pages[index]) continue
    const group = groups.get(`${index}:${item.group}`) ?? { index, polygons: [], boxes: [], location: item.polygon.location }
    group.polygons.push(relativePolygon(item.polygon, area))
    group.boxes.push(relativeBounds(item.bounds, area))
    groups.set(`${index}:${item.group}`, group)
  }
  for (const group of groups.values()) {
    const page = pages[group.index]
    if (!page) continue
    const box = {
      left: Math.min(...group.boxes.map((item) => item.left)),
      top: Math.min(...group.boxes.map((item) => item.top)),
      right: Math.max(...group.boxes.map((item) => item.right)),
      bottom: Math.max(...group.boxes.map((item) => item.bottom)),
    }
    page.art = [...(page.art ?? []), { bounds: box, polygons: group.polygons, location: group.location }]
  }
}

export function attachPlacements(placements: SpreadPlacements, pageElements: Element[], pages: IdmlPage[], report: ReportCollector): void {
  const pageAreas = pageElements.map(pageArea)
  const areas = pageAreas.map((points) => (points ? placementBounds(points) : undefined))
  const pageIndex = (center: Point | undefined) => (center ? pageAreas.findIndex((area) => area !== undefined && contains(area, center)) : -1)
  placeFrames(placements.frames, pageIndex, areas, pages)
  placeArt(placements.polygons, pageIndex, areas, pages)
  for (const link of placements.links) {
    const index = pageIndex(link.center)
    const area = areas[index]
    const page = pages[index]
    if (area && page && link.bounds) page.links = [...(page.links ?? []), { ...link, bounds: relativeBounds(link.bounds, area) }]
    else {
      report.link(link.uri, link.location)
      report.add(report.unsupportedElements, 'link', link.location)
    }
  }
  for (const item of placements.unmapped) {
    const page = pages[pageIndex(item.center)]
    if (page) page.unmapped = [...(page.unmapped ?? []), { name: item.name, location: item.location }]
    else report.add(report.unsupportedElements, item.name, item.location)
  }
  for (const item of placements.polygons) {
    if (pageIndex(item.center) < 0) report.add(report.unsupportedElements, 'polygon art group', item.polygon.location)
  }
}
