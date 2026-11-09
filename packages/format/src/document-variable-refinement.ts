import type { z } from 'zod'
import { DOCUMENT_NODE_MODEL, type DocumentNodeType } from './document-node-model.ts'
import { walkDocumentNodes } from './document-node-refinement.ts'
import type { DocumentNode } from './document-nodes.ts'
import type { VariableNode } from './document-nodes-book.ts'

function htmlValues(node: { type: DocumentNodeType } & Record<string, unknown>): string[] {
  return [...DOCUMENT_NODE_MODEL[node.type].content].flatMap((field) => {
    const value = node[field]
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object' || Array.isArray(value) || 'kind' in value) return []
    const values = Object.values(value)
    return values.every((entry) => typeof entry === 'string') ? values : []
  })
}

function contentHtml(nodes: DocumentNode[]): string[] {
  const result: string[] = []
  walkDocumentNodes(nodes, (node) => result.push(...htmlValues(node as typeof node & Record<string, unknown>)))
  return result
}

function dataVariableNames(html: string): string[] {
  const names: string[] = []
  const attribute = /\bdata-variable\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  for (const match of html.matchAll(attribute)) names.push(match[1] ?? match[2] ?? match[3] ?? '')
  return names
}

export function refineDocumentVariables(
  document: { variables: VariableNode[]; children: DocumentNode[]; templates: Array<{ html: string }> },
  ctx: z.RefinementCtx,
): void {
  const declared = new Set<string>()
  document.variables.forEach((variable, index) => {
    if (variable.name.startsWith('segnavia:')) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'name'],
        message: `variable name ${JSON.stringify(variable.name)} is reserved for the library; rename it without the segnavia: prefix to clear this refusal`,
      })
    }
    if (declared.has(variable.name)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'name'],
        message: `variable name ${JSON.stringify(variable.name)} is declared more than once; keep one declaration or rename one to clear this refusal`,
      })
    }
    declared.add(variable.name)
  })
  const referenced = [...contentHtml(document.children), ...document.templates.flatMap((template) => htmlValues({ ...template, type: 'template' }))].flatMap(
    dataVariableNames,
  )
  for (const name of referenced) {
    if (declared.has(name)) continue
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message: `data-variable names undeclared variable ${JSON.stringify(name)}; declare that variable or remove data-variable to clear this refusal`,
    })
  }
}
