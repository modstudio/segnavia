import type { z } from 'zod'
import type { DocumentNode } from './document-nodes.ts'
import type { VariableNode } from './document-nodes-book.ts'

function contentHtml(nodes: DocumentNode[]): string[] {
  return nodes.flatMap((node) => {
    const own = [
      'html' in node && typeof node.html === 'string' ? node.html : undefined,
      node.type === 'page' && node.body && 'html' in node.body ? node.body.html : undefined,
      node.type === 'page' ? Object.values(node.regions ?? {}) : [],
    ].flatMap((value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value : []))
    return 'children' in node ? [...own, ...contentHtml(node.children)] : own
  })
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
  const referenced = [...contentHtml(document.children), ...document.templates.map((template) => template.html)].flatMap(dataVariableNames)
  for (const name of referenced) {
    if (declared.has(name)) continue
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message: `data-variable names undeclared variable ${JSON.stringify(name)}; declare that variable or remove data-variable to clear this refusal`,
    })
  }
}
