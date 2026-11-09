import type { z } from 'zod'
import { DOCUMENT_NODE_MODEL, type DocumentNodeType } from './document-node-model.ts'
import { walkDocumentNodes } from './document-node-refinement.ts'
import type { DocumentNode } from './document-nodes.ts'
import type { HeadTemplateNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { LIBRARY_HEAD_TEMPLATES } from './head-template.ts'
import { LIBRARY_VARIABLES } from './variable.ts'

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

function placedHeadTemplateNames(html: string): string[] {
  const names: string[] = []
  const attribute = (attrs: string, name: string): string | undefined => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
    return match?.[1] ?? match?.[2] ?? match?.[3]
  }
  for (const tag of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    if (attribute(tag[0], 'data-motif') !== 'segnavia:head-template') continue
    names.push(attribute(tag[0], 'data-motif-name') ?? '')
  }
  return names
}

export function refineDocumentVariables(
  document: {
    variables: VariableNode[]
    headTemplates: HeadTemplateNode[]
    parentPages: Array<{ head?: string; foot?: string; regions?: Record<string, string> }>
    children: DocumentNode[]
    templates: TemplateNode[]
  },
  ctx: z.RefinementCtx,
): void {
  const declared = new Set(LIBRARY_VARIABLES.map((variable) => variable.name))
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
  const slots = new Set(document.templates.flatMap((template) => template.slots?.map((slot) => slot.key) ?? []))
  const heads = new Set(LIBRARY_HEAD_TEMPLATES.map((template) => template.name))
  document.headTemplates.forEach((template, index) => {
    if (template.name.startsWith('segnavia:')) {
      ctx.addIssue({
        code: 'custom',
        path: ['headTemplates', index, 'name'],
        message: `head template name ${JSON.stringify(template.name)} is reserved for the library; rename it without the segnavia: prefix to clear this refusal`,
      })
    }
    if (heads.has(template.name))
      ctx.addIssue({
        code: 'custom',
        path: ['headTemplates', index, 'name'],
        message: `head template name ${JSON.stringify(template.name)} is declared more than once; keep one declaration or rename one to clear this refusal`,
      })
    heads.add(template.name)
    template.parts.forEach((part, partIndex) => {
      if ('variable' in part && !declared.has(part.variable))
        ctx.addIssue({
          code: 'custom',
          path: ['headTemplates', index, 'parts', partIndex],
          message: `head template names undeclared variable ${JSON.stringify(part.variable)}; declare that variable or remove the part to clear this refusal`,
        })
      if ('record' in part && !slots.has(part.record))
        ctx.addIssue({
          code: 'custom',
          path: ['headTemplates', index, 'parts', partIndex],
          message: `head template names undeclared record slot ${JSON.stringify(part.record)}; declare that slot on a record template or remove the part to clear this refusal`,
        })
    })
  })
  const regionHtml = document.parentPages
    .flatMap((parent) => [parent.head, parent.foot, ...Object.values(parent.regions ?? {})])
    .filter((html): html is string => html !== undefined)
  for (const name of regionHtml.flatMap(placedHeadTemplateNames)) {
    if (!heads.has(name))
      ctx.addIssue({
        code: 'custom',
        path: ['parentPages'],
        message: `segnavia:head-template placement names undeclared template ${JSON.stringify(name)}; declare that head template or remove the placement to clear this refusal`,
      })
  }
}
