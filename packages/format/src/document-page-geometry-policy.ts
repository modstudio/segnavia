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

export function documentPageGeometryIssues(document: DocumentPageGeometryFacts): DocumentPageGeometryIssue[] {
  if (document.kind !== 'book') return []
  const issues: DocumentPageGeometryIssue[] = []
  const visit = (nodes: DocumentNode[], path: (string | number)[]): void => {
    nodes.forEach((node, index) => {
      const nodePath = [...path, index]
      if (node.type === 'section' && node.pageGeometry !== undefined) {
        const label = node.title ?? node.id ?? nodePath.join('.')
        if (document.style?.pageGeometries?.[node.pageGeometry] === undefined) {
          issues.push({
            path: [...nodePath, 'pageGeometry'],
            message: `Section "${label}" names unknown page geometry "${node.pageGeometry}"; declare it in style.pageGeometries, or remove pageGeometry to clear this refusal.`,
          })
        }
        if (document.mode === 'continuous') {
          issues.push({
            path: [...nodePath, 'pageGeometry'],
            message: `Section "${label}" sets pageGeometry in a continuous book; use paginated layout, or remove pageGeometry to clear this refusal.`,
          })
        }
      }
      if ('children' in node) visit(node.children, [...nodePath, 'children'])
    })
  }
  visit(document.children, ['children'])
  return issues
}
