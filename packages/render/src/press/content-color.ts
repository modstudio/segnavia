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

export function selectsFillSpace(operator: string): boolean {
  return operator === 'cs' || operator === 'sc' || operator === 'scn' || operator === 'rg' || operator === 'g' || operator === 'k'
}

export function spaceName(operands: Array<{ kind: string; raw: string }>): string | undefined {
  return operands.length === 1 && operands[0]?.kind === 'name' ? operands[0].raw.slice(1) : undefined
}

export function currentNamedSpace(operator: string, fill?: string, stroke?: string): string | undefined {
  return selectsFillSpace(operator) ? fill : stroke
}

export function selectedSpaceFor(operator: string, operands: Array<{ kind: string; raw: string }>, namedSpace?: string): string | undefined {
  return operator === 'cs' || operator === 'CS' ? spaceName(operands) : namedSpace
}

function nextNamedSpace(operator: string, operands: Array<{ kind: string; raw: string }>, fill?: string, stroke?: string): { fill?: string; stroke?: string } {
  if (operator === 'cs' || operator === 'CS') {
    const name = spaceName(operands)
    return selectsFillSpace(operator) ? { fill: name, stroke } : { fill, stroke: name }
  }
  if (operator === 'rg' || operator === 'RG' || operator === 'g' || operator === 'G' || operator === 'k' || operator === 'K') {
    return selectsFillSpace(operator) ? { fill: undefined, stroke } : { fill, stroke: undefined }
  }
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
