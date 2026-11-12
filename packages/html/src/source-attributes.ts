import type { ChildNode } from 'domhandler'
import { isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'

export interface SourceAttributeFamily {
  name: string
  subjectAttributes: readonly string[]
  issues: (where: string, attribs: Record<string, string>) => string[]
}

interface SourceAttributeOptions {
  requireAuthoredId?: boolean
  refusedFamilies?: readonly string[]
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
      for (const family of families) {
        issues.push(...family.issues(childWhere, child.attribs))
        const present = family.subjectAttributes.some((attribute) => child.attribs[attribute] !== undefined)
        if (!present) continue
        if (options.refusedFamilies?.includes(family.name)) {
          issues.push(`${childWhere} ${family.name} cannot take effect in a parent-page region; remove it to clear this refusal`)
        } else if (!block) {
          issues.push(`${childWhere} ${family.name} has no block subject; place it in a block element to clear this refusal`)
        } else if (options.requireAuthoredId && !identified) {
          issues.push(`${childWhere} ${family.name} has no authored block id; add data-segnavia-id to it or a block ancestor to clear this refusal`)
        }
      }
      visit(child.children, block, BLOCK_KINDS.has(child.name.toLowerCase()) ? identified : identifiedBlock)
    }
  }
  visit(nodes, false, false)
  return issues
}
