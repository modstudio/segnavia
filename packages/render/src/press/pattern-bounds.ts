import type { PDFDict } from 'pdf-lib'
import { applyAffine, IDENTITY_MATRIX, multiplyAffine } from './affine.ts'
import { visitContentTokens } from './content.ts'
import { numberOf } from './pdf-objects.ts'

// This bounds the painted-bounds save stack so the tracker cannot grow without limit.
export const MAX_GRAPHICS_SAVE_DEPTH = 64

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
  lineJoin: number
  lineWidth: number
  miterLimit: number
  stroke?: PDFDict
}

interface PathState {
  box?: UserRect
  current?: Point
  start?: Point
}

interface TrackState {
  bounds: PaintedBounds
  current: Graphics
  graphics: Graphics[]
  pastSaveCap: boolean
  path: PathState
  resolve: (name: string) => PDFDict | undefined
  resolveGraphicsState: (name: string) => PDFDict | undefined
}

type Operand = { kind: string; raw: string }
type Handler = (state: TrackState, operands: Operand[]) => void

const cloneGraphics = (graphics: Graphics): Graphics => ({
  ctm: graphics.ctm.slice(),
  fill: graphics.fill,
  lineJoin: graphics.lineJoin,
  lineWidth: graphics.lineWidth,
  miterLimit: graphics.miterLimit,
  stroke: graphics.stroke,
})

function numbers(operands: Operand[], count: number): number[] | undefined {
  if (operands.length !== count || operands.some((operand) => operand.kind !== 'number')) return undefined
  return operands.map((operand) => Number(operand.raw))
}

function nameOf(operands: Operand[]): string | undefined {
  if (operands.length !== 1 || operands[0]?.kind !== 'name') return undefined
  return operands[0].raw.slice(1)
}

function includePoint(box: UserRect | undefined, x: number, y: number): UserRect {
  if (!box) return { x0: x, y0: y, x1: x, y1: y }
  return { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) }
}

function addPoint(path: PathState, x: number, y: number): Point {
  const point = { x, y }
  path.box = includePoint(path.box, x, y)
  path.current = point
  return point
}

function deviceBox(box: UserRect, ctm: readonly number[]): UserRect | undefined {
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

function strokeMargin(graphics: Graphics): number | undefined {
  const half = graphics.lineWidth / 2
  if (!Number.isFinite(half) || half < 0) return undefined
  if (graphics.lineJoin === 1 || graphics.lineJoin === 2) return half
  if (graphics.lineJoin !== 0 || !Number.isFinite(graphics.miterLimit) || graphics.miterLimit < 1) return undefined
  return graphics.miterLimit * half
}

function paintFill(state: TrackState): void {
  if (state.pastSaveCap) {
    addPaint(state.bounds, state.current.fill, 'unbounded')
    return
  }
  if (!state.path.box) return
  const box = deviceBox(state.path.box, state.current.ctm)
  if (box) addPaint(state.bounds, state.current.fill, box)
}

function paintStroke(state: TrackState): void {
  if (state.pastSaveCap) {
    addPaint(state.bounds, state.current.stroke, 'unbounded')
    return
  }
  if (!state.path.box) return
  const margin = strokeMargin(state.current)
  if (margin === undefined) {
    addPaint(state.bounds, state.current.stroke, 'unbounded')
    return
  }
  const grown = {
    x0: state.path.box.x0 - margin,
    y0: state.path.box.y0 - margin,
    x1: state.path.box.x1 + margin,
    y1: state.path.box.y1 + margin,
  }
  const box = deviceBox(grown, state.current.ctm)
  if (box) addPaint(state.bounds, state.current.stroke, box)
}

function closePath(path: PathState): void {
  if (path.start) addPoint(path, path.start.x, path.start.y)
}

function clearPath(path: PathState): void {
  path.box = undefined
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

function setLineWidth(state: TrackState, width: number): boolean {
  if (!Number.isFinite(width) || width < 0) return false
  state.current.lineWidth = width
  return true
}

function setLineJoin(state: TrackState, join: number): boolean {
  if (join !== 0 && join !== 1 && join !== 2) return false
  state.current.lineJoin = join
  return true
}

function setMiterLimit(state: TrackState, miter: number): boolean {
  if (!Number.isFinite(miter) || miter < 1) return false
  state.current.miterLimit = miter
  return true
}

function applyStrokeNumber(state: TrackState, operands: Operand[], assign: (state: TrackState, value: number) => boolean): void {
  const value = numbers(operands, 1)?.[0]
  if (value === undefined || !assign(state, value)) markUnbounded(state)
}

function applyStyleNumber(dict: PDFDict, key: string, assign: (value: number) => boolean): boolean {
  const value = numberOf(dict, key)
  return value === undefined || assign(value)
}

function applyGraphicsState(state: TrackState, operands: Operand[]): void {
  const name = nameOf(operands)
  const dict = name ? state.resolveGraphicsState(name) : undefined
  if (!dict) {
    markUnbounded(state)
    return
  }
  const applied =
    applyStyleNumber(dict, 'LW', (width) => setLineWidth(state, width)) &&
    applyStyleNumber(dict, 'LJ', (join) => setLineJoin(state, join)) &&
    applyStyleNumber(dict, 'ML', (miter) => setMiterLimit(state, miter))
  if (!applied) markUnbounded(state)
}

function saveGraphics(state: TrackState): void {
  if (state.pastSaveCap || state.graphics.length >= MAX_GRAPHICS_SAVE_DEPTH) {
    state.pastSaveCap = true
    markUnbounded(state)
    return
  }
  state.graphics.push(cloneGraphics(state.current))
}

const handlers: Record<string, Handler> = {
  q: saveGraphics,
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
  w: (state, operands) => applyStrokeNumber(state, operands, setLineWidth),
  j: (state, operands) => applyStrokeNumber(state, operands, setLineJoin),
  M: (state, operands) => applyStrokeNumber(state, operands, setMiterLimit),
  gs: applyGraphicsState,
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

export function recordPatternPaintedBounds(
  bytes: Uint8Array,
  resolve: (name: string) => PDFDict | undefined,
  bounds: PaintedBounds,
  resolveGraphicsState: (name: string) => PDFDict | undefined = () => undefined,
): void {
  const state: TrackState = {
    bounds,
    current: { ctm: IDENTITY_MATRIX.slice(), lineJoin: 0, lineWidth: 1, miterLimit: 10 },
    graphics: [],
    pastSaveCap: false,
    path: {},
    resolve,
    resolveGraphicsState,
  }
  visitContentTokens(bytes, (operator, operands) => handlers[operator]?.(state, operands))
}
