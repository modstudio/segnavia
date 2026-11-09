import type { z } from 'zod'
import type { DocumentNode } from './document-nodes.ts'
import { type DOCUMENT_PROFILES, type DocumentKind, profileRefusal } from './document-profile.ts'
import { refineRecords } from './record-refinement.ts'

type DocumentProfile = (typeof DOCUMENT_PROFILES)[DocumentKind]
type Path = (string | number)[]

function walk(nodes: DocumentNode[], visit: (node: DocumentNode, path: Path) => void, path: Path = ['children']): void {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index]
    visit(node, nodePath)
    if ('children' in node) walk(node.children, visit, [...nodePath, 'children'])
  })
}

function refinePage(node: Extract<DocumentNode, { type: 'page' }>, path: Path, kind: DocumentKind, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const field of ['body', 'template', 'regions'] as const) {
    if (node[field] !== undefined && !(profile.pageFields as readonly string[]).includes(field)) {
      ctx.addIssue({ code: 'custom', path: [...path, field], message: profileRefusal(field, kind, profile.pageFields, 'page field') })
    }
  }
}

const SECTION_FIELDS = ['title', 'contentsLabel', 'subtitle', 'contents', 'opens', 'numbering', 'parents', 'headTemplate', 'pageGeometry', 'template'] as const

function refineSection(node: Extract<DocumentNode, { type: 'section' }>, path: Path, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const field of SECTION_FIELDS) {
    if (node[field] === undefined || (profile.sectionFields as readonly string[]).includes(field)) continue
    const remedies = profile.sectionFieldRemedies as Partial<Record<(typeof SECTION_FIELDS)[number], string>>
    const message = remedies[field] ?? `section field ${field} is not yet supported; remove it to clear this refusal`
    ctx.addIssue({ code: 'custom', path: [...path, field], message })
  }
  const requirement = profile.sectionChildren
  if (requirement && (node.children.length !== requirement.exact || node.children[0]?.type !== requirement.node)) {
    ctx.addIssue({ code: 'custom', path: [...path, 'children'], message: requirement.message })
  }
}

export function refineDocumentNodes(
  document: Parameters<typeof refineRecords>[0] & { kind: DocumentKind },
  profile: DocumentProfile,
  ctx: z.RefinementCtx,
): void {
  walk(document.children, (node, path) => {
    if (!(profile.children as readonly string[]).includes(node.type)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'type'], message: profileRefusal(node.type, document.kind, profile.children) })
    }
    if (node.type === 'page') refinePage(node, path, document.kind, profile, ctx)
    if (node.type === 'section') refineSection(node, path, profile, ctx)
  })
  refineRecords(document, ctx)
}
