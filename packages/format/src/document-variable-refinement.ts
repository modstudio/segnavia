import type { z } from 'zod'
import { renderIssuePath } from './closed-object.ts'
import { contentHtml, dataAttributeValues, htmlValues } from './document-html.ts'
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

function dataVariableNames(html: string): string[] {
  return dataAttributeValues(html, 'data-variable')
}

function skipSpace(html: string, from: number): number {
  let index = from
  while (/\s/.test(html[index] ?? '')) index += 1
  return index
}

function skipAttributeValue(html: string, from: number): number {
  let index = skipSpace(html, from)
  const quote = html[index] === '"' || html[index] === "'" ? html[index] : undefined
  if (!quote) {
    while (index < html.length && !/[\s<>]/.test(html[index] ?? '')) index += 1
    return index
  }
  index += 1
  while (index < html.length && html[index] !== quote) index += 1
  return html[index] === quote ? index + 1 : index
}

function tagAttributes(html: string, start: number): { attributes: string[]; next: number } {
  let index = start + 1
  while (/[\w:.-]/.test(html[index] ?? '')) index += 1
  const attributes: string[] = []
  while (index < html.length) {
    index = skipSpace(html, index)
    if (html[index] === '>') return { attributes, next: index + 1 }
    if (html[index] === '/' && html[index + 1] === '>') return { attributes, next: index + 2 }
    if (html[index] === '<') return { attributes, next: index }
    const nameStart = index
    while (/[^\s"'<>/=]/.test(html[index] ?? '')) index += 1
    const name = html.slice(nameStart, index)
    if (!name) {
      index += 1
      continue
    }
    attributes.push(name)
    index = skipSpace(html, index)
    if (html[index] === '=') index = skipAttributeValue(html, index + 1)
  }
  return { attributes, next: index }
}

function nextTagAttributes(html: string, from: number): { attributes: string[]; next: number } | undefined {
  let start = html.indexOf('<', from)
  while (start >= 0) {
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4)
      if (end < 0) return undefined
      start = html.indexOf('<', end + 3)
    } else if (/[A-Za-z]/.test(html[start + 1] ?? '')) {
      return tagAttributes(html, start)
    } else {
      start = html.indexOf('<', start + 1)
    }
  }
  return undefined
}

export function motifFieldsWithoutPlacement(html: string): string[] {
  const fields: string[] = []
  let cursor = 0
  for (let tag = nextTagAttributes(html, cursor); tag; tag = nextTagAttributes(html, cursor)) {
    const names = new Set(tag.attributes.map((name) => name.toLowerCase()))
    if (!names.has('data-motif')) {
      for (const attribute of tag.attributes) if (/^data-motif-[\w:.-]+$/i.test(attribute)) fields.push(attribute)
    }
    cursor = tag.next
  }
  return fields
}

export function refineDocumentVariables(
  document: {
    variables: Array<Variable | VariableNode>
    headTemplates: Array<Omit<HeadTemplateNode, 'type'> | HeadTemplateNode>
    parentPages: Array<{ regions: Record<string, { html: string }> }>
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
  const readsDocumentFacts = document.variables.some((variable) => variable.kind === 'meta')
  if (readsDocumentFacts && !intlAcceptsLanguage(document.lang))
    ctx.addIssue({
      code: 'custom',
      path: ['settings', 'lang'],
      message: `document language tag ${JSON.stringify(document.lang)} is not accepted by Intl; set a valid BCP 47 lang to clear this refusal`,
    })
  document.variables.forEach((variable, index) => {
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
  })
  const templates = document.templates ?? []
  const html = [
    ...contentHtml(document.children ?? []),
    ...templates.flatMap((template, index) => htmlValues({ ...template, type: 'template' }).map((value) => ({ html: value, path: ['templates', index] }))),
  ]
  for (const location of html) {
    const renderedPath = renderIssuePath(location.path)
    for (const name of dataVariableNames(location.html)) {
      if (declared.has(name)) continue
      ctx.addIssue({
        code: 'custom',
        path: location.path,
        message: `${renderedPath}: data-variable names undeclared variable ${JSON.stringify(name)}; declare that variable or remove data-variable to clear this refusal`,
      })
    }
    for (const field of motifFieldsWithoutPlacement(location.html)) {
      ctx.addIssue({
        code: 'custom',
        path: location.path,
        message: `${renderedPath}: ${field} needs data-motif on the same element; add data-motif or remove ${field} to clear this refusal`,
      })
    }
  }
  const slots = new Set([...templates.flatMap((template) => template.slots?.map((slot) => slot.key) ?? []), ...(document.recordSlotNames ?? [])])
  const heads = new Set(withLibraryEntries(LIBRARY_HEAD_TEMPLATES, document.headTemplates).map((template) => template.name))
  document.headTemplates.forEach((template, index) => {
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
  const regionHtml = document.parentPages.flatMap((parent) => Object.values(parent.regions).map((region) => region.html))
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
