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

export interface DecoratedLine {
  top: number
  bottom: number
  decorationTop?: number
  decorationBottom?: number
}

export function backgroundPaints(color: string, image: string): boolean {
  if (image !== 'none') return true
  if (color === 'transparent') return false
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
  const shadowPaint = box.shadows.length > 0
  const outlinePaint = box.outlineWidth > 0
  const paintsTop = box.borderTop > 0 || box.background || shadowPaint || outlinePaint
  const paintsBottom = box.borderBottom > 0 || box.background || shadowPaint || outlinePaint
  const outlineReach = outlinePaint ? Math.max(0, box.outlineWidth + box.outlineOffset) : 0
  const shadowTop = box.shadows.reduce((reach, shadow) => Math.max(reach, shadow.blur + shadow.spread - shadow.offsetBlock), 0)
  const shadowBottom = box.shadows.reduce((reach, shadow) => Math.max(reach, shadow.blur + shadow.spread + shadow.offsetBlock), 0)
  return {
    ...(paintsTop ? { top: box.top - Math.max(outlineReach, shadowTop) } : {}),
    ...(paintsBottom ? { bottom: box.bottom + Math.max(outlineReach, shadowBottom) } : {}),
  }
}

export function applyBoxDecorations(lines: readonly DecoratedLine[], boxes: readonly MeasuredDecorationBox[]): DecoratedLine[] {
  const decorated = lines.map((line) => ({ ...line }))
  for (const box of boxes) {
    const indexes = decorated.flatMap((line, index) => {
      const middle = (line.top + line.bottom) / 2
      return middle >= box.top - 0.5 && middle <= box.bottom + 0.5 ? [index] : []
    })
    const first = indexes[0]
    const last = indexes.at(-1)
    if (first === undefined || last === undefined) continue
    const edges = decorationEdges(box)
    if (edges.top !== undefined) decorated[first]!.decorationTop = Math.min(decorated[first]!.decorationTop ?? edges.top, edges.top)
    if (edges.bottom !== undefined) decorated[last]!.decorationBottom = Math.max(decorated[last]!.decorationBottom ?? edges.bottom, edges.bottom)
  }
  return decorated
}
