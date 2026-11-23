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
import { headTemplatePlacements, LIBRARY_MOTIF_ELEMENT, MOTIF_ATTRIBUTE, motifFieldAttribute, RECORD_CONTEXT } from './motif.ts'
import { AS_OF_SLOT_KEYS } from './slots.ts'
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

function readAttributeValue(html: string, from: number): { next: number; value: string } {
  let index = skipSpace(html, from)
  const quote = html[index] === '"' || html[index] === "'" ? html[index] : undefined
  if (!quote) {
    const start = index
    while (index < html.length && !/[\s<>]/.test(html[index] ?? '')) index += 1
    return { next: index, value: html.slice(start, index) }
  }
  index += 1
  const start = index
  while (index < html.length && html[index] !== quote) index += 1
  return { next: html[index] === quote ? index + 1 : index, value: html.slice(start, index) }
}

interface HtmlTag {
  attributes: Array<{ name: string; value?: string }>
  name: string
  next: number
}

function tagAttributes(html: string, start: number): HtmlTag {
  let index = start + 1
  while (/[\w:.-]/.test(html[index] ?? '')) index += 1
  const name = html.slice(start + 1, index)
  const attributes: Array<{ name: string; value?: string }> = []
  while (index < html.length) {
    index = skipSpace(html, index)
    if (html[index] === '>') return { attributes, name, next: index + 1 }
    if (html[index] === '/' && html[index + 1] === '>') return { attributes, name, next: index + 2 }
    if (html[index] === '<') return { attributes, name, next: index }
    const nameStart = index
    while (/[^\s"'<>/=]/.test(html[index] ?? '')) index += 1
    const attributeName = html.slice(nameStart, index)
    if (!attributeName) {
      index += 1
      continue
    }
    index = skipSpace(html, index)
    if (html[index] === '=') {
      const read = readAttributeValue(html, index + 1)
      attributes.push({ name: attributeName, value: read.value })
      index = read.next
    } else attributes.push({ name: attributeName })
  }
  return { attributes, name, next: index }
}

function nextTagAttributes(html: string, from: number): HtmlTag | undefined {
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

interface MotifFormIssue {
  element: string
  attribute?: string
  kind: 'field-without-placement' | 'malformed-attribute' | 'element'
}

function motifFormIssues(html: string): MotifFormIssue[] {
  const issues: MotifFormIssue[] = []
  let cursor = 0
  for (let tag = nextTagAttributes(html, cursor); tag; tag = nextTagAttributes(html, cursor)) {
    const element = tag.name.toLowerCase()
    const attributes = tag.attributes.map((attribute) => attribute.name.toLowerCase())
    const names = new Set(attributes)
    const motifFieldPrefix = motifFieldAttribute('')
    if (element === LIBRARY_MOTIF_ELEMENT) issues.push({ element, kind: 'element' })
    for (const attribute of attributes) {
      const field = attribute.startsWith(motifFieldPrefix) ? attribute.slice(motifFieldPrefix.length) : ''
      if (/^[\w:.-]+$/.test(field) && attribute === motifFieldAttribute(field)) {
        if (!names.has(MOTIF_ATTRIBUTE)) issues.push({ element, attribute, kind: 'field-without-placement' })
      } else if (attribute !== MOTIF_ATTRIBUTE && attribute.startsWith(MOTIF_ATTRIBUTE)) {
        issues.push({ element, attribute, kind: 'malformed-attribute' })
      }
    }
    cursor = tag.next
  }
  return issues
}

function slotPaths(html: string): string[] {
  const paths: string[] = []
  let cursor = 0
  for (let tag = nextTagAttributes(html, cursor); tag; tag = nextTagAttributes(html, cursor)) {
    for (const attribute of tag.attributes) {
      if (attribute.name.toLowerCase() === 'data-slot-value' && attribute.value !== undefined) paths.push(attribute.value)
    }
    cursor = tag.next
  }
  return paths
}

const RETIRED_SLOT_PATHS = new Map(
  ['printedPage.number', 'printedPage.total', 'printedPage.documentNumber', 'printedPage.documentTotal', 'printedPage.runningHead'].map((path) => [
    path,
    'printed-page paths were replaced by folio and pages variables placed through head templates; declare a variable and place it to clear this refusal',
  ]),
)
const AS_OF_SLOT_PATHS: ReadonlySet<string> = new Set(AS_OF_SLOT_KEYS)

function refineHtmlReferences(
  location: { html: string; path: PropertyKey[]; region?: boolean },
  declared: ReadonlySet<string>,
  recordSlots: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  const renderedPath = renderIssuePath(location.path)
  for (const name of dataVariableNames(location.html)) {
    if (declared.has(name)) continue
    ctx.addIssue({
      code: 'custom',
      path: location.path,
      message: `${renderedPath}: data-variable names undeclared variable ${JSON.stringify(name)}; declare that variable or remove data-variable to clear this refusal`,
    })
  }
  for (const path of slotPaths(location.html)) {
    const remedy = RETIRED_SLOT_PATHS.get(path)
    if (remedy) {
      ctx.addIssue({
        code: 'custom',
        path: location.path,
        message: `${renderedPath}: data-slot-value names retired slot path ${JSON.stringify(path)}; ${remedy}`,
      })
      continue
    }
    const recordKey = path.startsWith(`${RECORD_CONTEXT}.`) ? path.slice(RECORD_CONTEXT.length + 1) : undefined
    const definedRecord = recordKey !== undefined && recordSlots.has(recordKey)
    if ((recordKey !== undefined && !definedRecord) || (location.region && !definedRecord && !AS_OF_SLOT_PATHS.has(path)))
      ctx.addIssue({
        code: 'custom',
        path: location.path,
        message: `${renderedPath}: data-slot-value names undefined slot path ${JSON.stringify(path)}; declare that slot or remove data-slot-value to clear this refusal`,
      })
  }
  for (const issue of motifFormIssues(location.html)) {
    const element = `<${issue.element}>`
    const message =
      issue.kind === 'element'
        ? `${element} is not a document HTML element; place a motif with data-motif or remove ${element} to clear this refusal`
        : issue.kind === 'malformed-attribute'
          ? `${element} has malformed motif attribute ${JSON.stringify(issue.attribute)}; use data-motif="<key>" and data-motif-<field>, or remove ${JSON.stringify(issue.attribute)} to clear this refusal`
          : `${element} ${JSON.stringify(issue.attribute)} needs data-motif on the same element; add data-motif or remove ${JSON.stringify(issue.attribute)} to clear this refusal`
    ctx.addIssue({ code: 'custom', path: location.path, message: `${renderedPath}: ${message}` })
  }
}

function refineHeadTemplatePlacements(locations: Array<{ html: string; path: PropertyKey[] }>, heads: ReadonlySet<string>, ctx: z.RefinementCtx): void {
  for (const location of locations) {
    const renderedPath = renderIssuePath(location.path)
    for (const placement of headTemplatePlacements(location.html)) {
      if (!placement.name) {
        ctx.addIssue({
          code: 'custom',
          path: location.path,
          message: `${renderedPath}: segnavia:head-template placement has no data-motif-name; add data-motif-name or remove the placement to clear this refusal`,
        })
      } else if (!heads.has(placement.name)) {
        ctx.addIssue({
          code: 'custom',
          path: location.path,
          message: `${renderedPath}: segnavia:head-template placement names undeclared template ${JSON.stringify(placement.name)}; declare that head template or remove the placement to clear this refusal`,
        })
      }
      if (!placement.bounded) {
        ctx.addIssue({
          code: 'custom',
          path: location.path,
          message: `${renderedPath}: segnavia:head-template placement for ${JSON.stringify(placement.name)} is unclosed; close the element to clear this refusal`,
        })
      }
    }
  }
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
    if (
      (textVariable?.from === 'part-title' || textVariable?.from === 'part-number') &&
      (document.children !== undefined || document.partNames !== undefined) &&
      !parts.has(textVariable.part)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables', index, 'part'],
        message: `${textVariable.from} variable ${JSON.stringify(variable.name)} names unknown part ${JSON.stringify(textVariable.part)}; name an existing part or remove the variable to clear this refusal`,
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
  const regionHtml = document.parentPages.flatMap((parent, parentIndex) =>
    Object.entries(parent.regions).map(([name, region]) => ({ html: region.html, path: ['parentPages', parentIndex, 'regions', name], region: true })),
  )
  const html = [
    ...contentHtml(document.children ?? []),
    ...templates.flatMap((template, index) => htmlValues({ ...template, type: 'template' }).map((value) => ({ html: value, path: ['templates', index] }))),
    ...regionHtml,
  ]
  const slots = new Set([...templates.flatMap((template) => template.slots?.map((slot) => slot.key) ?? []), ...(document.recordSlotNames ?? [])])
  for (const location of html) refineHtmlReferences(location, declared, slots, ctx)
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
  refineHeadTemplatePlacements(regionHtml, heads, ctx)
}
