import type { PaginateVariable, Variable } from '@segnavia/format'
import { partNumberKey } from '@segnavia/html'
import type { MeasuredLineBox } from './composer-measure.ts'

export function partTitleValues(variables: readonly Variable[], parts: Record<string, string>): PaginateVariable[] {
  const values: PaginateVariable[] = []
  for (const variable of variables) {
    if (variable.kind !== 'text') continue
    let value: string | undefined
    if (variable.from === 'part-title') value = Object.hasOwn(parts, variable.part) ? parts[variable.part] : undefined
    else if (variable.from === 'part-number') {
      const key = partNumberKey(variable.part)
      value = Object.hasOwn(parts, key) ? parts[key] : undefined
    } else continue
    values.push({ name: variable.name, value: value === undefined ? '' : value, line: 0, scope: 'flow' })
  }
  return values
}

export function parsePartValues(value: string | null): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch (_error) {
    return {}
  }
}

interface SectionTitleNode {
  getAttribute(name: string): string | null
  getBoundingClientRect(): { top: number }
}

type TextVariable = Extract<Variable, { kind: 'text' }>

function isSectionTitleVariable(variable: Variable): variable is TextVariable {
  return variable.kind === 'text' && ['section-title', 'chapter-number', 'part-title', 'part-number'].includes(variable.from)
}

function sectionTitleValue(variable: TextVariable, titleNode: SectionTitleNode): string {
  if (variable.from === 'section-title') return titleNode.getAttribute('data-segnavia-section-title') ?? ''
  if (variable.from === 'chapter-number') return titleNode.getAttribute('data-segnavia-section-number') ?? ''
  if (variable.from !== 'part-title' && variable.from !== 'part-number') return ''
  const heldParts = parsePartValues(titleNode.getAttribute('data-segnavia-parts'))
  const partKey = variable.from === 'part-number' ? partNumberKey(variable.part) : variable.part
  return Object.hasOwn(heldParts, partKey) ? heldParts[partKey] || '' : ''
}

export function sectionTitleValues(
  variables: readonly Variable[],
  titleNodes: readonly SectionTitleNode[],
  lines: readonly MeasuredLineBox[],
  origin: number,
  lineFor: (top: number, lines: readonly MeasuredLineBox[]) => number,
): PaginateVariable[] {
  const values: PaginateVariable[] = []
  for (const variable of variables) {
    if (!isSectionTitleVariable(variable)) continue
    for (const titleNode of titleNodes) {
      const titleTop = titleNode.getBoundingClientRect().top - origin
      values.push({ name: variable.name, value: sectionTitleValue(variable, titleNode), line: lineFor(titleTop, lines), scope: 'flow' })
    }
  }
  return values
}
