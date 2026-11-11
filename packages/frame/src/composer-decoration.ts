import type { PaginateLine } from '@segnavia/format'
import { measuredCandidateRun } from './composer-measure.ts'

export interface MeasuredShadow {
  offsetBlock: number
  blur: number
  spread: number
}

export interface MeasuredDecorationBox {
  top: number
  bottom: number
  borderTop: number
  borderBottom: number
  background: boolean
  shadows: MeasuredShadow[]
  outlineWidth: number
  outlineOffset: number
}

export function backgroundPaints(color: string, image: string): boolean {
  if (image !== 'none') return true
  if (color === 'transparent') return false
  const slashAlpha = color.match(/\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%?\s*\)$/)
  if (slashAlpha && Number(slashAlpha[1]) === 0) return false
  const rgba = color.match(/^rgba?\(([^)]+)\)$/)
  if (!rgba) return color !== ''
  const parts = rgba[1]?.split(/[\s,/]+/).filter(Boolean) ?? []
  return parts.length < 4 || Number(parts[3]) !== 0
}

export function shadowParts(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts
}

export function parseBoxShadows(value: string): MeasuredShadow[] | undefined {
  if (value === 'none') return []
  const shadows: MeasuredShadow[] = []
  for (const part of shadowParts(value)) {
    if (/(^|\s)inset(\s|$)/.test(part)) continue
    const lengths = [...part.matchAll(/(-?(?:\d+(?:\.\d+)?|\.\d+))px\b/g)].map((match) => Number(match[1]))
    if (lengths.length !== 3 && lengths.length !== 4) return undefined
    shadows.push({ offsetBlock: lengths[1] ?? 0, blur: lengths[2] ?? 0, spread: lengths[3] ?? 0 })
  }
  return shadows
}

export function decorationEdges(box: MeasuredDecorationBox): { top?: number; bottom?: number } {
  const outlinePaint = box.outlineWidth > 0
  const outlineReach = outlinePaint ? Math.max(0, box.outlineWidth + box.outlineOffset) : 0
  const topEdges = box.shadows.map((shadow) => box.top + shadow.offsetBlock - shadow.blur - shadow.spread)
  const bottomEdges = box.shadows.map((shadow) => box.bottom + shadow.offsetBlock + shadow.blur + shadow.spread)
  if (box.borderTop > 0 || box.background) topEdges.push(box.top)
  if (box.borderBottom > 0 || box.background) bottomEdges.push(box.bottom)
  if (outlinePaint) {
    topEdges.push(box.top - outlineReach)
    bottomEdges.push(box.bottom + outlineReach)
  }
  return {
    ...(topEdges.length > 0 ? { top: Math.min(...topEdges) } : {}),
    ...(bottomEdges.length > 0 ? { bottom: Math.max(...bottomEdges) } : {}),
  }
}

export function applyBoxDecorations(lines: readonly PaginateLine[], boxes: readonly MeasuredDecorationBox[]): PaginateLine[] {
  const decorated = lines.map((line) => ({ ...line }))
  for (const box of boxes) {
    const run = measuredCandidateRun(decorated, box)
    if (!run) continue
    const first = run.start
    const last = run.end - 1
    const firstLine = decorated[first]
    const lastLine = decorated[last]
    if (!firstLine || !lastLine) continue
    const edges = decorationEdges(box)
    if (edges.top !== undefined) firstLine.decorationTop = Math.min(firstLine.decorationTop ?? edges.top, edges.top)
    if (edges.bottom !== undefined) lastLine.decorationBottom = Math.max(lastLine.decorationBottom ?? edges.bottom, edges.bottom)
  }
  return decorated
}
