import type { z } from 'zod'
import { DOCUMENT_NODE_MODEL, type DocumentNodeType } from './document-node-model.ts'
import { walkDocumentNodes } from './document-node-refinement.ts'
import type { DocumentNode } from './document-nodes.ts'
import type { HeadTemplateNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { DOCUMENT_PROFILES, type DocumentKind } from './document-profile.ts'
import { LIBRARY_HEAD_TEMPLATES } from './head-template.ts'
import { withLibraryEntries } from './library-names.ts'
import { metadataExtraKeyAllowed } from './metadata-extra-key.ts'
import { headTemplatePlacements } from './motif.ts'
import { LIBRARY_VARIABLES, type Variable } from './variable.ts'
import { STANDARD_META_FIELD_READERS } from './variable-document-facts.ts'

function intlAcceptsLanguage(lang: string | undefined): boolean {
  if (lang === undefined) return true
  try {
    Intl.getCanonicalLocales(lang)
    return true
  } catch {
    return false
  }
}

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
  document: {
    variables: Array<Variable | VariableNode>
    headTemplates: Array<Omit<HeadTemplateNode, 'type'> | HeadTemplateNode>
    parentPages: Array<{ head?: string; foot?: string; regions?: Record<string, string> }>
    children?: DocumentNode[]
    partNames?: string[]
    templates?: Array<Omit<TemplateNode, 'type'> | TemplateNode>
    recordSlotNames?: string[]
    metadata?: { extra?: Record<string, string> }
    kind?: DocumentKind
    lang?: string
  },
  ctx: z.RefinementCtx,
): void {
  const declared = new Set(withLibraryEntries(LIBRARY_VARIABLES, document.variables).map((variable) => variable.name))
  const parts = new Set(document.partNames ?? [])
  if (document.children) walkDocumentNodes(document.children, (node) => node.type === 'part' && parts.add(node.name))
  const authoredVariables = new Set<string>()
  const readsDocumentFacts = document.variables.some((variable) => variable.kind === 'meta')
  if (readsDocumentFacts && !intlAcceptsLanguage(document.lang))
    ctx.addIssue({
      code: 'custom',
      path: ['settings', 'lang'],
      message: `document language tag ${JSON.stringify(document.lang)} is not accepted by Intl; set a valid BCP 47 lang to clear this refusal`,
    })
  document.variables.forEach((variable, index) => {
    if (authoredVariables.has(variable.name)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'name'],
        message: `variable name ${JSON.stringify(variable.name)} is declared more than once; keep one declaration or rename one to clear this refusal`,
      })
    }
    const textVariable = variable.kind === 'text' ? (variable as Extract<Variable, { kind: 'text' }>) : undefined
    if (textVariable?.from === 'part-title' && (document.children !== undefined || document.partNames !== undefined) && !parts.has(textVariable.part)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'part'],
        message: `part-title variable ${JSON.stringify(variable.name)} names unknown part ${JSON.stringify(textVariable.part)}; name an existing part or remove the variable to clear this refusal`,
      })
    }
    if (variable.kind === 'meta' && document.kind && DOCUMENT_PROFILES[document.kind].metadata.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index],
        message: `meta variable ${JSON.stringify(variable.name)} cannot read metadata because a ${document.kind} document has no metadata; remove the variable or use a book document to clear this refusal`,
      })
    } else if (
      variable.kind === 'meta' &&
      !Object.hasOwn(STANDARD_META_FIELD_READERS, variable.field) &&
      !Object.hasOwn(document.metadata?.extra ?? {}, variable.field)
    ) {
      const remedy = metadataExtraKeyAllowed(variable.field)
        ? `declare metadata.extra.${variable.field}`
        : 'use title, subject, or authors, choose a metadata.extra key accepted by DocumentMetadata, or remove the variable'
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'field'],
        message: `meta variable ${JSON.stringify(variable.name)} names unknown metadata field ${JSON.stringify(variable.field)}; ${remedy} to clear this refusal`,
      })
    }
    authoredVariables.add(variable.name)
  })
  const templates = document.templates ?? []
  const referenced = [...contentHtml(document.children ?? []), ...templates.flatMap((template) => htmlValues({ ...template, type: 'template' }))].flatMap(
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
  const slots = new Set([...templates.flatMap((template) => template.slots?.map((slot) => slot.key) ?? []), ...(document.recordSlotNames ?? [])])
  const heads = new Set(withLibraryEntries(LIBRARY_HEAD_TEMPLATES, document.headTemplates).map((template) => template.name))
  const authoredHeads = new Set<string>()
  document.headTemplates.forEach((template, index) => {
    if (authoredHeads.has(template.name))
      ctx.addIssue({
        code: 'custom',
        path: ['headTemplates', index, 'name'],
        message: `head template name ${JSON.stringify(template.name)} is declared more than once; keep one declaration or rename one to clear this refusal`,
      })
    authoredHeads.add(template.name)
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
  for (const placement of regionHtml.flatMap((html) => headTemplatePlacements(html))) {
    if (!heads.has(placement.name))
      ctx.addIssue({
        code: 'custom',
        path: ['parentPages'],
        message: `segnavia:head-template placement names undeclared template ${JSON.stringify(placement.name)}; declare that head template or remove the placement to clear this refusal`,
      })
    if (!placement.bounded)
      ctx.addIssue({
        code: 'custom',
        path: ['parentPages'],
        message: `segnavia:head-template placement for ${JSON.stringify(placement.name)} is unclosed; close the element to clear this refusal`,
      })
  }
}
