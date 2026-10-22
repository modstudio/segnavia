import { RenderRefusedError } from '../errors.ts'

export interface ContentColorSpaces {
  fill?: string
  stack: Array<{ fill?: string; stroke?: string }>
  stroke?: string
}

export const emptyContentColorSpaces = (): ContentColorSpaces => ({ stack: [] })

export function snapshotColorSpaces(spaces: ContentColorSpaces): ContentColorSpaces {
  return { fill: spaces.fill, stack: spaces.stack.map((entry) => ({ fill: entry.fill, stroke: entry.stroke })), stroke: spaces.stroke }
}

export function restoreColorSpaces(target: ContentColorSpaces, source: ContentColorSpaces): void {
  target.fill = source.fill
  target.stack = source.stack.map((entry) => ({ fill: entry.fill, stroke: entry.stroke }))
  target.stroke = source.stroke
}

export function currentNamedSpace(operator: string, fill?: string, stroke?: string): string | undefined {
  if (operator === operator.toLowerCase()) return fill
  return stroke
}

function spaceName(operands: Array<{ kind: string; raw: string }>): string | undefined {
  return operands.length === 1 && operands[0]?.kind === 'name' ? operands[0].raw.slice(1) : undefined
}

function nextNamedSpace(operator: string, operands: Array<{ kind: string; raw: string }>, fill?: string, stroke?: string): { fill?: string; stroke?: string } {
  if (operator === 'cs') return { fill: spaceName(operands), stroke }
  if (operator === 'CS') return { fill, stroke: spaceName(operands) }
  if (operator === 'rg' || operator === 'g' || operator === 'k') return { fill: undefined, stroke }
  if (operator === 'RG' || operator === 'G' || operator === 'K') return { fill, stroke: undefined }
  return { fill, stroke }
}

export function advanceColorSpaces(
  operator: string,
  operands: Array<{ kind: string; raw: string }>,
  fill: string | undefined,
  stroke: string | undefined,
  stack: Array<{ fill?: string; stroke?: string }>,
  nesting: number,
): { fill?: string; stroke?: string } {
  if (operator === 'q') {
    if (stack.length >= nesting)
      throw new RenderRefusedError(`The PDF has unsupported q operator nesting over ${nesting}; supported: at most ${nesting} levels.`)
    stack.push({ fill, stroke })
    return { fill, stroke }
  }
  if (operator === 'Q') return stack.pop() ?? { fill, stroke }
  return nextNamedSpace(operator, operands, fill, stroke)
}
