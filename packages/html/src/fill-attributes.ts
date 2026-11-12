import { FillMode, RegionOverflow } from '@segnavia/format'
import { type ChildNode, isTag } from 'domhandler'

function integer(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback
  return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
}

export function fillAttributeIssues(nodes: readonly ChildNode[], where: string, insideNamedRegion = false): string[] {
  const issues: string[] = []
  const visit = (children: readonly ChildNode[], inRegion: boolean) => {
    for (const child of children) {
      if (!isTag(child)) continue
      const namedRegion = inRegion || child.attribs['data-region'] !== undefined || child.attribs['data-segnavia-region'] !== undefined
      const fill = child.attribs['data-fill']
      const overflow = child.attribs['data-overflow']
      if (fill !== undefined && !FillMode.options.includes(fill as 'repeat'))
        issues.push(`${where} <${child.name}> data-fill "${fill}" is invalid; use repeat to clear this refusal`)
      if (fill !== undefined && !inRegion)
        issues.push(`${where} <${child.name}> data-fill is outside a named template or parent-page region; move it into a region to clear this refusal`)
      const min = integer(child.attribs['data-fill-min'], 1)
      const max = integer(child.attribs['data-fill-max'], 10_000)
      if (child.attribs['data-fill-min'] !== undefined && min === undefined)
        issues.push(`${where} <${child.name}> data-fill-min is invalid; use a non-negative integer to clear this refusal`)
      if (child.attribs['data-fill-max'] !== undefined && max === undefined)
        issues.push(`${where} <${child.name}> data-fill-max is invalid; use a non-negative integer to clear this refusal`)
      if (min !== undefined && max !== undefined && min > max)
        issues.push(`${where} <${child.name}> data-fill-min is greater than data-fill-max; lower the minimum or raise the maximum to clear this refusal`)
      if (overflow !== undefined && !RegionOverflow.options.includes(overflow as 'grow' | 'truncate' | 'refuse'))
        issues.push(`${where} <${child.name}> data-overflow "${overflow}" is invalid; use grow, truncate or refuse to clear this refusal`)
      if (overflow !== undefined && !namedRegion)
        issues.push(`${where} <${child.name}> data-overflow is outside a named template or parent-page region; move it onto a region to clear this refusal`)
      visit(child.children, namedRegion)
    }
  }
  visit(nodes, insideNamedRegion)
  return issues
}
