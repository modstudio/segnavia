import type { DocumentNode } from './document-nodes.ts'
import type { PageGeometry } from './style-sheet.ts'

export interface DocumentPageGeometryFacts {
  kind: string
  mode?: string
  children: DocumentNode[]
  style?: { pageGeometries?: Record<string, PageGeometry> }
}

export interface DocumentPageGeometryIssue {
  path: (string | number)[]
  message: string
}

export interface PageGeometryFact {
  label: string
  path: (string | number)[]
  pageGeometry: string
  declaredNames: readonly string[]
  mode?: string
}

export function pageGeometryIssues(facts: readonly PageGeometryFact[]): DocumentPageGeometryIssue[] {
  return facts.flatMap((fact) => {
    const issues: DocumentPageGeometryIssue[] = []
    if (!fact.declaredNames.includes(fact.pageGeometry)) {
      issues.push({
        path: [...fact.path, 'pageGeometry'],
        message: `Section "${fact.label}" names unknown page geometry "${fact.pageGeometry}"; declare it in style.pageGeometries, or remove pageGeometry to clear this refusal.`,
      })
    }
    if (fact.mode === 'continuous') {
      issues.push({
        path: [...fact.path, 'pageGeometry'],
        message: `Section "${fact.label}" sets pageGeometry in a continuous book; use paginated layout, or remove pageGeometry to clear this refusal.`,
      })
    }
    return issues
  })
}

export function documentPageGeometryIssues(document: DocumentPageGeometryFacts): DocumentPageGeometryIssue[] {
  if (document.kind !== 'book') return []
  const facts: PageGeometryFact[] = []
  const declaredNames = Object.keys(document.style?.pageGeometries ?? {})
  const visit = (nodes: DocumentNode[], path: (string | number)[]): void => {
    nodes.forEach((node, index) => {
      const nodePath = [...path, index]
      if (node.type === 'section' && node.pageGeometry !== undefined) {
        const label = node.title ?? node.id ?? nodePath.join('.')
        facts.push({ label, path: nodePath, pageGeometry: node.pageGeometry, declaredNames, mode: document.mode })
      }
      if ('children' in node && node.children !== undefined) visit(node.children, [...nodePath, 'children'])
    })
  }
  visit(document.children, ['children'])
  return pageGeometryIssues(facts)
}
