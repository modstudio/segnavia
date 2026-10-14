import { applyAffine } from './affine.ts'

export interface UserRect {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface Point {
  x: number
  y: number
}

export interface PathState {
  box?: UserRect
  current?: Point
  start?: Point
}

export function includePoint(box: UserRect | undefined, x: number, y: number): UserRect {
  if (!box) return { x0: x, y0: y, x1: x, y1: y }
  return { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
}

export function addPoint(path: PathState, x: number, y: number): Point {
  const point = { x, y }
  path.box = includePoint(path.box, x, y)
  path.current = point
  return point
}

export function deviceBox(box: UserRect, ctm: readonly number[]): UserRect | undefined {
  const corners = [applyAffine(ctm, box.x0, box.y0), applyAffine(ctm, box.x1, box.y0), applyAffine(ctm, box.x0, box.y1), applyAffine(ctm, box.x1, box.y1)]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys)
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return undefined
  return { x0, y0, x1, y1 }
}

export function closePath(path: PathState): void {
  if (path.start) addPoint(path, path.start.x, path.start.y)
}

export function clearPath(path: PathState): void {
  path.box = undefined
  path.current = undefined
  path.start = undefined
}

export function moveTo(path: PathState, x: number, y: number): void {
  path.start = addPoint(path, x, y)
}

export function lineTo(path: PathState, x: number, y: number): void {
  addPoint(path, x, y)
}

export function curveTo(path: PathState, values: readonly number[]): void {
  addPoint(path, values[0] ?? 0, values[1] ?? 0)
  addPoint(path, values[2] ?? 0, values[3] ?? 0)
  addPoint(path, values[4] ?? 0, values[5] ?? 0)
}

export function curveV(path: PathState, values: readonly number[]): void {
  if (!path.current) return
  addPoint(path, path.current.x, path.current.y)
  addPoint(path, values[0] ?? 0, values[1] ?? 0)
  addPoint(path, values[2] ?? 0, values[3] ?? 0)
}

export function curveY(path: PathState, values: readonly number[]): void {
  addPoint(path, values[0] ?? 0, values[1] ?? 0)
  addPoint(path, values[2] ?? 0, values[3] ?? 0)
  addPoint(path, values[2] ?? 0, values[3] ?? 0)
}

export function rectTo(path: PathState, x: number, y: number, width: number, height: number): void {
  addPoint(path, x, y)
  path.start = { x, y }
  addPoint(path, x + width, y)
  addPoint(path, x + width, y + height)
  addPoint(path, x, y + height)
  addPoint(path, x, y)
}

export function intersectRect(left: UserRect, right: UserRect): UserRect | undefined {
  const x0 = Math.max(left.x0, right.x0)
  const y0 = Math.max(left.y0, right.y0)
  const x1 = Math.min(left.x1, right.x1)
  const y1 = Math.min(left.y1, right.y1)
  if (!(x0 < x1) || !(y0 < y1)) return undefined
  return { x0, y0, x1, y1 }
}
