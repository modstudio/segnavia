import { FIT_STRATEGIES, FitAxis, FitBox, type FitStrategy } from '@segnavia/format'
import { type ChildNode, type Element, isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'

export const ABSOLUTE_UNITS = ['px', 'pt', 'pc', 'in', 'cm', 'mm', 'q'] as const
export const ABSOLUTE_PX: Readonly<Record<string, number>> = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 }

export function parseCssLength(value: string): { value: number; unit: string } | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]+)?$/i.exec(value.trim())
  return match?.[1] ? { value: Number(match[1]), unit: (match[2] ?? '').toLowerCase() } : undefined
}

export function lengthPx(value: string, table: Readonly<Record<string, number>>): number | undefined {
  const parsed = parseCssLength(value)
  const factor = parsed && table[parsed.unit]
  return parsed && parsed.value > 0 && factor !== undefined ? parsed.value * factor : undefined
}

export const fitList = (value: string | null | undefined): string[] => (value == null ? [] : value.split(',').map((part) => part.trim()))

function strategiesOf(attribs: Record<string, string>): FitStrategy[] | undefined {
  const values = fitList(attribs['data-fit'] ?? 'size')
  return values.length > 0 && new Set(values).size === values.length && values.every((value) => (FIT_STRATEGIES as readonly string[]).includes(value))
    ? (values as FitStrategy[])
    : undefined
}

function valueIssue(attribute: string, strategy: FitStrategy, value: string): string | undefined {
  const parsed = parseCssLength(value)
  if (!parsed || (attribute === 'data-fit-step' ? !(parsed.value > 0) : strategy !== 'tracking' && !(parsed.value > 0))) {
    return `${attribute} value "${value}" is not valid`
  }
  if (strategy === 'leading' && parsed.unit === '') {
    return attribute === 'data-fit-step' || parsed.value >= 1 ? undefined : `${attribute} unitless leading "${value}" is under 1.0`
  }
  if (parsed.unit === '' && strategy === 'tracking') return `${attribute} tracking "${value}" needs an absolute CSS unit`
  if (!ABSOLUTE_UNITS.includes(parsed.unit as (typeof ABSOLUTE_UNITS)[number])) return `${attribute} value "${value}" is not an absolute CSS length`
  return undefined
}

export function fitAttributeIssues(where: string, attribs: Record<string, string>): string[] {
  const attributes = ['data-fit', 'data-fit-min', 'data-fit-max', 'data-fit-step', 'data-fit-axis', 'data-fit-box', 'data-fit-group']
  if (!attributes.some((name) => attribs[name] !== undefined)) return []
  const strategies = strategiesOf(attribs)
  if (!strategies)
    return [`${where} data-fit "${attribs['data-fit'] ?? ''}" is invalid; use an ordered, non-repeated list of size, leading or tracking to clear this refusal`]
  const issues: string[] = []
  const parsedLists = new Map<string, string[]>()
  for (const attribute of ['data-fit-min', 'data-fit-max', 'data-fit-step']) {
    const values = fitList(attribs[attribute])
    if (values.length === 0) continue
    parsedLists.set(attribute, values)
    if (values.length !== strategies.length) {
      issues.push(
        `${where} ${attribute} has ${values.length} values but data-fit has ${strategies.length}; provide one value per strategy to clear this refusal`,
      )
      continue
    }
    values.forEach((value, index) => {
      const issue = valueIssue(attribute, strategies[index] as FitStrategy, value)
      if (issue) issues.push(`${where} ${issue}; use a valid bound for ${strategies[index]} to clear this refusal`)
    })
  }
  const mins = parsedLists.get('data-fit-min')
  const maxes = parsedLists.get('data-fit-max')
  if (mins && maxes && mins.length === strategies.length && maxes.length === strategies.length) {
    strategies.forEach((strategy, index) => {
      const min = parseCssLength(mins[index] ?? '')
      const max = parseCssLength(maxes[index] ?? '')
      if (min && max && min.unit === max.unit && min.value > max.value) {
        issues.push(`${where} data-fit-min for ${strategy} is greater than data-fit-max; lower the minimum or raise the maximum to clear this refusal`)
      }
    })
  }
  const axis = attribs['data-fit-axis']
  if (axis && !FitAxis.options.includes(axis as (typeof FitAxis.options)[number]))
    issues.push(`${where} data-fit-axis "${axis}" is invalid; use block, inline or both to clear this refusal`)
  const box = attribs['data-fit-box']
  if (box && !FitBox.options.includes(box as (typeof FitBox.options)[number]))
    issues.push(`${where} data-fit-box "${box}" is invalid; use self or parent to clear this refusal`)
  return issues
}

export function fitIssuesIn(nodes: readonly ChildNode[], where: string): string[] {
  const issues: string[] = []
  const visit = (children: readonly ChildNode[], insideBlock: boolean) => {
    for (const child of children) {
      if (!isTag(child)) continue
      issues.push(...fitAttributeIssues(`${where} <${child.name}>`, child.attribs))
      const block = insideBlock || BLOCK_KINDS.has(child.name.toLowerCase())
      if (!block && (child.attribs['data-fit'] !== undefined || child.attribs['data-fit-min'] !== undefined)) {
        issues.push(`${where} <${child.name}> data-fit has no block subject; place it in a block element to clear this refusal`)
      }
      visit(child.children, block)
    }
  }
  visit(nodes, false)
  return issues
}

export function namedRegionFitIssues(where: string, regions: Element[]): string[] {
  return regions.flatMap((region) => fitIssuesIn([region], where))
}

export function templateRegionFitIssues(template: string, regions: Element[]): string[] {
  return namedRegionFitIssues(`template "${template}"`, regions)
}
