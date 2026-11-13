import type { z } from 'zod'
import type { DocumentNode } from './document-nodes.ts'
import { type DOCUMENT_PROFILES, type DocumentKind, matchesChildForms, profileRefusal } from './document-profile.ts'
import { renamedParentRulesFieldIssue } from './parent-rules.ts'
import { refineRecords } from './record-refinement.ts'

type DocumentProfile = (typeof DOCUMENT_PROFILES)[DocumentKind]
type Path = (string | number)[]

export function walkDocumentNodes(nodes: DocumentNode[], visit: (node: DocumentNode, path: Path) => void, path: Path = ['children']): void {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index]
    visit(node, nodePath)
    if ('children' in node && node.children !== undefined) walkDocumentNodes(node.children, visit, [...nodePath, 'children'])
  })
}

function refinePage(node: Extract<DocumentNode, { type: 'page' }>, path: Path, kind: DocumentKind, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const field of ['body', 'template', 'regions'] as const) {
    if (node[field] !== undefined && !(profile.pageFields as readonly string[]).includes(field)) {
      ctx.addIssue({ code: 'custom', path: [...path, field], message: profileRefusal(field, kind, profile.pageFields, 'page field') })
    }
  }
}

export const PROFILED_SECTION_FIELDS = [
  'title',
  'contentsLabel',
  'subtitle',
  'contents',
  'opens',
  'numbering',
  'parentRules',
  'pageGeometry',
  'template',
  'orientation',
] as const
export const UNRESTRICTED_SECTION_FIELDS = ['dir', 'lang'] as const

function refineSection(node: Extract<DocumentNode, { type: 'section' }>, path: Path, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  if (node.parents !== undefined) {
    ctx.addIssue({ code: 'custom', ...renamedParentRulesFieldIssue('section field parents', [...path, 'parents']) })
  }
  for (const field of PROFILED_SECTION_FIELDS) {
    if (node[field] === undefined || (profile.sectionFields as readonly string[]).includes(field)) continue
    const remedies = profile.sectionFieldRemedies as Partial<Record<(typeof PROFILED_SECTION_FIELDS)[number], string>>
    const message = remedies[field] ?? `section field ${field} is not yet supported; remove it to clear this refusal`
    ctx.addIssue({ code: 'custom', path: [...path, field], message })
  }
  if (profile.sectionChildren) {
    const matches = matchesChildForms(node.children, profile.sectionChildren.forms)
    if (!matches) ctx.addIssue({ code: 'custom', path: [...path, 'children'], message: profile.sectionChildren.message })
  }
}

function refineContents(node: Extract<DocumentNode, { type: 'contents' }>, path: Path, ctx: z.RefinementCtx): void {
  if (node.parents !== undefined) {
    ctx.addIssue({ code: 'custom', ...renamedParentRulesFieldIssue('contents field parents', [...path, 'parents']) })
  }
}

function refinePart(node: Extract<DocumentNode, { type: 'part' }>, path: Path, ctx: z.RefinementCtx): void {
  if (node.parents !== undefined) {
    ctx.addIssue({ code: 'custom', ...renamedParentRulesFieldIssue('part field parents', [...path, 'parents']) })
  }
}

export function refineDocumentNodes(
  document: Parameters<typeof refineRecords>[0] & { kind: DocumentKind },
  profile: DocumentProfile,
  ctx: z.RefinementCtx,
): void {
  walkDocumentNodes(document.children, (node, path) => {
    if (!(profile.children as readonly string[]).includes(node.type)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'type'], message: profileRefusal(node.type, document.kind, profile.children) })
    }
    if (node.type === 'page') refinePage(node, path, document.kind, profile, ctx)
    if (node.type === 'section') refineSection(node, path, profile, ctx)
    if (node.type === 'part') refinePart(node, path, ctx)
    if (node.type === 'contents') refineContents(node, path, ctx)
  })
  refineRecords(document, ctx)
}
