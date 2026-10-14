import type { PDFDict } from 'pdf-lib'
import { visitContentTokens } from './content.ts'
import { IDENTITY_MATRIX, multiplyAffine } from './sample-shading.ts'

export interface UserRect {
  x0: number
  x1: number
  y0: number
  y1: number
}

export type PatternPaint = UserRect | 'unbounded'
export type PaintedBounds = WeakMap<PDFDict, PatternPaint>

interface Point {
  x: number
  y: number
}

interface Graphics {
  ctm: number[]
  fill?: PDFDict
  stroke?: PDFDict
}

interface PathState {
  current?: Point
  points: Point[]
  start?: Point
}

interface TrackState {
  bounds: PaintedBounds
  current: Graphics
  graphics: Graphics[]
  path: PathState
  resolve: (name: string) => PDFDict | undefined
}

type Operand = { kind: string; raw: string }
type Handler = (state: TrackState, operands: Operand[]) => void

const cloneGraphics = (graphics: Graphics): Graphics => ({ ctm: graphics.ctm.slice(), fill: graphics.fill, stroke: graphics.stroke })

function numbers(operands: Operand[], count: number): number[] | undefined {
  if (operands.length !== count || operands.some((operand) => operand.kind !== 'number')) return undefined
  return operands.map((operand) => Number(operand.raw))
}

function nameOf(operands: Operand[]): string | undefined {
  if (operands.length !== 1 || operands[0]?.kind !== 'name') return undefined
  return operands[0].raw.slice(1)
}

function addPoint(path: PathState, x: number, y: number): Point {
  const point = { x, y }
  path.points.push(point)
  path.current = point
  return point
}

function pathBox(path: PathState, ctm: readonly number[]): UserRect | undefined {
  if (path.points.length === 0) return undefined
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const point of path.points) {
    const x = (ctm[0] ?? 1) * point.x + (ctm[2] ?? 0) * point.y + (ctm[4] ?? 0)
    const y = (ctm[1] ?? 0) * point.x + (ctm[3] ?? 1) * point.y + (ctm[5] ?? 0)
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return undefined
  return { x0, y0, x1, y1 }
}

export function unionRect(left: UserRect, right: UserRect): UserRect {
  return { x0: Math.min(left.x0, right.x0), y0: Math.min(left.y0, right.y0), x1: Math.max(left.x1, right.x1), y1: Math.max(left.y1, right.y1) }
}

function addPaint(bounds: PaintedBounds, pattern: PDFDict | undefined, paint: PatternPaint): void {
  if (!pattern) return
  const existing = bounds.get(pattern)
  if (existing === 'unbounded' || paint === 'unbounded') {
    bounds.set(pattern, 'unbounded')
    return
  }
  bounds.set(pattern, existing ? unionRect(existing, paint) : paint)
}

function paintFill(state: TrackState): void {
  const box = pathBox(state.path, state.current.ctm)
  if (box) addPaint(state.bounds, state.current.fill, box)
}

function paintStroke(state: TrackState): void {
  const box = pathBox(state.path, state.current.ctm)
  if (box) addPaint(state.bounds, state.current.stroke, box)
}

function closePath(path: PathState): void {
  if (path.start) addPoint(path, path.start.x, path.start.y)
}

function clearPath(path: PathState): void {
  path.points = []
  path.current = undefined
  path.start = undefined
}

function applyMove(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 2)
  if (!values) return
  const point = addPoint(state.path, values[0] ?? 0, values[1] ?? 0)
  state.path.start = point
}

function applyLine(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 2)
  if (!values) return
  addPoint(state.path, values[0] ?? 0, values[1] ?? 0)
}

function applyCurve(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 6)
  if (!values) return
  addPoint(state.path, values[0] ?? 0, values[1] ?? 0)
  addPoint(state.path, values[2] ?? 0, values[3] ?? 0)
  addPoint(state.path, values[4] ?? 0, values[5] ?? 0)
}

function applyCurveV(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (!values || !state.path.current) return
  addPoint(state.path, state.path.current.x, state.path.current.y)
  addPoint(state.path, values[0] ?? 0, values[1] ?? 0)
  addPoint(state.path, values[2] ?? 0, values[3] ?? 0)
}

function applyCurveY(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (!values) return
  addPoint(state.path, values[0] ?? 0, values[1] ?? 0)
  addPoint(state.path, values[2] ?? 0, values[3] ?? 0)
  addPoint(state.path, values[2] ?? 0, values[3] ?? 0)
}

function applyRect(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (!values) return
  const x = values[0] ?? 0
  const y = values[1] ?? 0
  const width = values[2] ?? 0
  const height = values[3] ?? 0
  addPoint(state.path, x, y)
  state.path.start = { x, y }
  addPoint(state.path, x + width, y)
  addPoint(state.path, x + width, y + height)
  addPoint(state.path, x, y + height)
  addPoint(state.path, x, y)
}

function applyCm(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 6)
  if (!values) {
    addPaint(state.bounds, state.current.fill, 'unbounded')
    addPaint(state.bounds, state.current.stroke, 'unbounded')
    return
  }
  state.current.ctm = multiplyAffine(state.current.ctm, values)
}

function clearColor(state: TrackState, fill: boolean): void {
  if (fill) state.current.fill = undefined
  else state.current.stroke = undefined
}

function applyColor(state: TrackState, operator: string, operands: Operand[]): void {
  const fill = operator === operator.toLowerCase()
  const patternName = nameOf(operands)
  if ((operator === 'scn' || operator === 'SCN') && patternName) {
    const pattern = state.resolve(patternName)
    if (fill) state.current.fill = pattern
    else state.current.stroke = pattern
    return
  }
  if ((operator === 'cs' || operator === 'CS') && nameOf(operands) === 'Pattern') return
  clearColor(state, fill)
}

const colorHandler =
  (operator: string): Handler =>
  (state, operands) =>
    applyColor(state, operator, operands)

function markUnbounded(state: TrackState): void {
  addPaint(state.bounds, state.current.fill, 'unbounded')
  addPaint(state.bounds, state.current.stroke, 'unbounded')
}

function strokeAndClear(state: TrackState, close: boolean): void {
  if (close) closePath(state.path)
  paintStroke(state)
  clearPath(state.path)
}

function fillAndClear(state: TrackState): void {
  paintFill(state)
  clearPath(state.path)
}

function fillStrokeAndClear(state: TrackState, close: boolean): void {
  if (close) closePath(state.path)
  paintFill(state)
  paintStroke(state)
  clearPath(state.path)
}

const handlers: Record<string, Handler> = {
  q: (state) => {
    state.graphics.push(cloneGraphics(state.current))
  },
  Q: (state) => {
    const restored = state.graphics.pop()
    if (restored) state.current = restored
  },
  cm: applyCm,
  m: applyMove,
  l: applyLine,
  c: applyCurve,
  v: applyCurveV,
  y: applyCurveY,
  h: (state) => closePath(state.path),
  re: applyRect,
  n: (state) => clearPath(state.path),
  Do: markUnbounded,
  S: (state) => strokeAndClear(state, false),
  s: (state) => strokeAndClear(state, true),
  f: fillAndClear,
  F: fillAndClear,
  'f*': fillAndClear,
  B: (state) => fillStrokeAndClear(state, false),
  'B*': (state) => fillStrokeAndClear(state, false),
  b: (state) => fillStrokeAndClear(state, true),
  'b*': (state) => fillStrokeAndClear(state, true),
  cs: colorHandler('cs'),
  CS: colorHandler('CS'),
  sc: colorHandler('sc'),
  SC: colorHandler('SC'),
  scn: colorHandler('scn'),
  SCN: colorHandler('SCN'),
  rg: colorHandler('rg'),
  RG: colorHandler('RG'),
  g: colorHandler('g'),
  G: colorHandler('G'),
  k: colorHandler('k'),
  K: colorHandler('K'),
}

export function recordPatternPaintedBounds(bytes: Uint8Array, resolve: (name: string) => PDFDict | undefined, bounds: PaintedBounds): void {
  const state: TrackState = {
    bounds,
    current: { ctm: IDENTITY_MATRIX.slice() },
    graphics: [],
    path: { points: [] },
    resolve,
  }
  visitContentTokens(bytes, (operator, operands) => handlers[operator]?.(state, operands))
}
