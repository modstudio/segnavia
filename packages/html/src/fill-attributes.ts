import { FILL_MAX_DEFAULT, FILL_MIN_DEFAULT, FillMode, PREFLIGHT_REGION_FIELD_LIMIT, RegionOverflow } from '@segnavia/format'
import { type ChildNode, isTag } from 'domhandler'

function integer(value: string | undefined, fallback: number): number | undefined {
  if (value === undefined) return fallback
  return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined
}

export function fillAttributeIssues(nodes: readonly ChildNode[], where: string, insideNamedRegion?: string): string[] {
  const issues: string[] = []
  const visit = (children: readonly ChildNode[], region: string | undefined, directRegionChild: boolean, repeatedRegion: string | undefined) => {
    for (const child of children) {
      if (!isTag(child)) continue
      const declaredRegion = child.attribs['data-region'] ?? child.attribs['data-segnavia-region']
      const currentRegion = declaredRegion ?? region
      issues.push(...elementIssues(child.name, child.attribs, where, currentRegion, directRegionChild, declaredRegion !== undefined))
      const currentRepeat = repeatedRegion ?? (child.attribs['data-fill'] === 'repeat' ? currentRegion : undefined)
      if (currentRepeat !== undefined && child.attribs['data-measure'] !== undefined) {
        const subject = child.attribs['data-segnavia-id'] ? `block "${child.attribs['data-segnavia-id']}"` : 'data-measure attribute'
        issues.push(
          `${where} <${child.name}> ${subject} is inside repeated fill region "${currentRepeat}"; move data-measure outside the repeated child to clear this refusal`,
        )
      }
      visit(child.children, currentRegion, declaredRegion !== undefined, currentRepeat)
    }
  }
  visit(nodes, insideNamedRegion, insideNamedRegion !== undefined, undefined)
  return issues
}

function elementIssues(
  name: string,
  attribs: Record<string, string>,
  where: string,
  region: string | undefined,
  directRegionChild: boolean,
  regionElement: boolean,
): string[] {
  const issues: string[] = []
  const fill = attribs['data-fill']
  const overflow = attribs['data-overflow']
  if (fill !== undefined && !FillMode.options.includes(fill as 'repeat'))
    issues.push(`${where} <${name}> data-fill "${fill}" is invalid; use repeat to clear this refusal`)
  if (fill !== undefined && region === undefined)
    issues.push(`${where} <${name}> data-fill is outside a named template or parent-page region; move it into a region to clear this refusal`)
  else if (fill !== undefined && !directRegionChild)
    issues.push(`${where} <${name}> data-fill in region "${region}" is not on a direct child; move it onto a direct child of the region to clear this refusal`)
  const min = integer(attribs['data-fill-min'], FILL_MIN_DEFAULT)
  const max = integer(attribs['data-fill-max'], FILL_MAX_DEFAULT)
  if (attribs['data-fill-min'] !== undefined && (min === undefined || min < 1))
    issues.push(`${where} <${name}> data-fill-min is invalid; use a positive integer to clear this refusal`)
  if (attribs['data-fill-max'] !== undefined && (max === undefined || max < 1 || max > PREFLIGHT_REGION_FIELD_LIMIT))
    issues.push(`${where} <${name}> data-fill-max is invalid; use a positive integer no greater than ${PREFLIGHT_REGION_FIELD_LIMIT} to clear this refusal`)
  if (min !== undefined && max !== undefined && min > max)
    issues.push(`${where} <${name}> data-fill-min is greater than data-fill-max; lower the minimum or raise the maximum to clear this refusal`)
  if (overflow !== undefined && !RegionOverflow.options.includes(overflow as 'grow' | 'truncate' | 'refuse'))
    issues.push(`${where} <${name}> data-overflow "${overflow}" is invalid; use grow, truncate or refuse to clear this refusal`)
  if (overflow !== undefined && !regionElement)
    issues.push(`${where} <${name}> data-overflow is not on a named template or parent-page region element; move it onto the region element to clear this refusal`)
  return issues
}
