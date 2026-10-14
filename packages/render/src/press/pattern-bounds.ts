import type { PDFDict } from 'pdf-lib'
import { IDENTITY_MATRIX, multiplyAffine } from './affine.ts'
import { visitContentTokens } from './content.ts'
import {
  clearPath,
  closePath,
  curveTo,
  curveV,
  curveY,
  deviceBox,
  intersectRect,
  lineTo,
  moveTo,
  type PathState,
  rectTo,
  type UserRect,
} from './pattern-path.ts'
import { numberOf } from './pdf-objects.ts'

export type { UserRect } from './pattern-path.ts'

// This bounds the painted-bounds save stack so the tracker cannot grow without limit.
export const MAX_GRAPHICS_SAVE_DEPTH = 64

export type PatternPaint = UserRect | 'unbounded'
export type PaintedBounds = WeakMap<PDFDict, PatternPaint>

interface Graphics {
  clip?: UserRect
  ctm: number[]
  fill?: PDFDict
  lineJoin: number
  lineWidth: number
  miterLimit: number
  stroke?: PDFDict
}

interface TrackState {
  bounds: PaintedBounds
  current: Graphics
  graphics: Graphics[]
  pastSaveCap: boolean
  path: PathState
  resolve: (name: string) => PDFDict | undefined
  resolveGraphicsState: (name: string) => PDFDict | undefined
  resolveShading: (name: string) => PDFDict | undefined
  shadingBounds: PaintedBounds
}

export interface PaintedBoundsTracker {
  feed(
    bytes: Uint8Array,
    resolve: (name: string) => PDFDict | undefined,
    resolveGraphicsState?: (name: string) => PDFDict | undefined,
    resolveShading?: (name: string) => PDFDict | undefined,
  ): void
}

type Operand = { kind: string; raw: string }
type Handler = (state: TrackState, operands: Operand[]) => void

const cloneGraphics = (graphics: Graphics): Graphics => ({
  clip: graphics.clip ? { ...graphics.clip } : undefined,
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

export function unionRect(left: UserRect, right: UserRect): UserRect {
  return { x0: Math.min(left.x0, right.x0), y0: Math.min(left.y0, right.y0), x1: Math.max(left.x1, right.x1), y1: Math.max(left.y1, right.y1) }
}

function addPaint(bounds: PaintedBounds, target: PDFDict | undefined, paint: PatternPaint): void {
  if (!target) return
  const existing = bounds.get(target)
  if (existing === 'unbounded' || paint === 'unbounded') {
    bounds.set(target, 'unbounded')
    return
  }
  bounds.set(target, existing ? unionRect(existing, paint) : paint)
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

function applyMove(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 2)
  if (values) moveTo(state.path, values[0] ?? 0, values[1] ?? 0)
}

function applyLine(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 2)
  if (values) lineTo(state.path, values[0] ?? 0, values[1] ?? 0)
}

function applyCurve(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 6)
  if (values) curveTo(state.path, values)
}

function applyCurveV(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (values) curveV(state.path, values)
}

function applyCurveY(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (values) curveY(state.path, values)
}

function applyRect(state: TrackState, operands: Operand[]): void {
  const values = numbers(operands, 4)
  if (values) rectTo(state.path, values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0)
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

function applyClip(state: TrackState): void {
  if (!state.path.box) return
  const box = deviceBox(state.path.box, state.current.ctm)
  if (!box) return
  state.current.clip = state.current.clip ? intersectRect(state.current.clip, box) : box
}

function applyShading(state: TrackState, operands: Operand[]): void {
  const name = nameOf(operands)
  const shading = name ? state.resolveShading(name) : undefined
  if (state.pastSaveCap || !state.current.clip) {
    addPaint(state.shadingBounds, shading, 'unbounded')
    return
  }
  addPaint(state.shadingBounds, shading, state.current.clip)
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
  W: applyClip,
  'W*': applyClip,
  sh: applyShading,
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

function emptyGraphics(): Graphics {
  return { ctm: IDENTITY_MATRIX.slice(), lineJoin: 0, lineWidth: 1, miterLimit: 10 }
}

export function createPaintedBoundsTracker(bounds: PaintedBounds, shadingBounds: PaintedBounds = new WeakMap()): PaintedBoundsTracker {
  const state: TrackState = {
    bounds,
    current: emptyGraphics(),
    graphics: [],
    pastSaveCap: false,
    path: {},
    resolve: () => undefined,
    resolveGraphicsState: () => undefined,
    resolveShading: () => undefined,
    shadingBounds,
  }
  return {
    feed(bytes, resolve, resolveGraphicsState = () => undefined, resolveShading = () => undefined) {
      state.resolve = resolve
      state.resolveGraphicsState = resolveGraphicsState
      state.resolveShading = resolveShading
      visitContentTokens(bytes, (operator, operands) => handlers[operator]?.(state, operands))
    },
  }
}

export function recordPatternPaintedBounds(
  bytes: Uint8Array,
  resolve: (name: string) => PDFDict | undefined,
  bounds: PaintedBounds,
  resolveGraphicsState: (name: string) => PDFDict | undefined = () => undefined,
  resolveShading: (name: string) => PDFDict | undefined = () => undefined,
  shadingBounds: PaintedBounds = new WeakMap(),
): void {
  createPaintedBoundsTracker(bounds, shadingBounds).feed(bytes, resolve, resolveGraphicsState, resolveShading)
}
