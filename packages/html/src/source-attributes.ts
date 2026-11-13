import type { ChildNode } from 'domhandler'
import { isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'

export interface SourceAttributeFamily {
  name: string
  subjectAttributes: readonly string[]
  issues: (where: string, attribs: Record<string, string>, element: string) => string[]
}

interface SourceAttributeOptions {
  requireAuthoredId?: boolean
  refusedFamilies?: readonly string[]
}

export function parentRegionAttributeIssue(where: string, family: string): string {
  return `${where} ${family} cannot take effect in a parent-page region; remove it to clear this refusal`
}

function familyIssues(
  family: SourceAttributeFamily,
  where: string,
  attribs: Record<string, string>,
  element: string,
  block: boolean,
  identified: boolean,
  options: SourceAttributeOptions,
): string[] {
  const issues = family.issues(where, attribs, element)
  if (!family.subjectAttributes.some((attribute) => attribs[attribute] !== undefined)) return issues
  if (options.refusedFamilies?.includes(family.name)) {
    issues.push(parentRegionAttributeIssue(where, family.name))
  } else if (!block) {
    issues.push(`${where} ${family.name} has no block subject; place it in a block element to clear this refusal`)
  } else if (options.requireAuthoredId && !identified) {
    issues.push(`${where} ${family.name} has no authored block id; add data-segnavia-id to it or a block ancestor to clear this refusal`)
  }
  return issues
}

export function sourceAttributeIssues(
  nodes: readonly ChildNode[],
  where: string,
  families: readonly SourceAttributeFamily[],
  options: SourceAttributeOptions = {},
): string[] {
  const issues: string[] = []
  const visit = (children: readonly ChildNode[], insideBlock: boolean, identifiedBlock: boolean) => {
    for (const child of children) {
      if (!isTag(child)) continue
      const childWhere = `${where} <${child.name}>`
      const block = insideBlock || BLOCK_KINDS.has(child.name.toLowerCase())
      const authoredId = child.attribs['data-segnavia-id'] !== undefined
      const identified = authoredId || identifiedBlock
      const element = child.name.toLowerCase()
      for (const family of families) issues.push(...familyIssues(family, childWhere, child.attribs, element, block, identified, options))
      visit(child.children, block, BLOCK_KINDS.has(child.name.toLowerCase()) ? identified : identifiedBlock)
    }
  }
  visit(nodes, false, false)
  return issues
}
