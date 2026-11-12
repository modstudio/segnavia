import { MEASURE_KINDS } from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'

const CUSTOM_PROPERTY = /^--[-_a-zA-Z\u0080-\u{10ffff}][-_a-zA-Z0-9\u0080-\u{10ffff}]*$/u

export function measureAttributeIssues(where: string, attribs: Record<string, string>): string[] {
  const measure = attribs['data-measure']
  const name = attribs['data-measure-as']
  if (measure === undefined && name === undefined) return []
  const issues: string[] = []
  if (!MEASURE_KINDS.includes(measure as (typeof MEASURE_KINDS)[number])) {
    issues.push(
      `${where} data-measure ${JSON.stringify(measure ?? '')} is invalid; use max-content-inline:children, block or line-count to clear this refusal`,
    )
  }
  if (name === undefined || !CUSTOM_PROPERTY.test(name)) {
    issues.push(`${where} data-measure-as ${JSON.stringify(name ?? '')} is invalid; use a CSS custom property name beginning with -- to clear this refusal`)
  }
  return issues
}

export function measureIssuesIn(nodes: readonly ChildNode[], where: string): string[] {
  const issues: string[] = []
  const visit = (children: readonly ChildNode[], insideBlock: boolean) => {
    for (const child of children) {
      if (!isTag(child)) continue
      issues.push(...measureAttributeIssues(`${where} <${child.name}>`, child.attribs))
      const block = insideBlock || BLOCK_KINDS.has(child.name.toLowerCase())
      if (!block && (child.attribs['data-measure'] !== undefined || child.attribs['data-measure-as'] !== undefined)) {
        issues.push(`${where} <${child.name}> data-measure has no block subject; place it in a block element to clear this refusal`)
      }
      visit(child.children, block)
    }
  }
  visit(nodes, false)
  return issues
}

export function namedRegionMeasureIssues(where: string, regions: Element[]): string[] {
  return regions.flatMap((region) => measureIssuesIn([region], where))
}

export function templateRegionMeasureIssues(template: string, regions: Element[]): string[] {
  return namedRegionMeasureIssues(`template "${template}"`, regions)
}
