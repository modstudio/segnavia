import { z } from 'zod'
import { BookMode, BookPage, BookShape } from './book.ts'
import { DeckShape } from './deck.ts'
import { DocumentMetadata } from './document-metadata.ts'
import { DocumentNode, type DocumentNode as DocumentNodeValue } from './document-nodes.ts'
import { ConditionNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { DOCUMENT_PROFILES, type DocumentKind, profileRefusal } from './document-profile.ts'
import { FontReference } from './fonts.ts'
import { DocumentLimitsValue } from './limits.ts'
import { Motif } from './motif.ts'
import { NumberSystem } from './numbering.ts'
import { PageSize } from './page.ts'
import { Print } from './print.ts'
import { PrintedPageRules } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'

const DocumentSettings = z.object({ scripts: Scripts.default('refuse'), dir: DeckShape.shape.dir, lang: z.string().optional() })
const DocumentStyle = z.object({ css: z.string().optional(), fonts: z.array(FontReference).optional(), motifs: z.array(Motif).optional() })
const DocumentData = z.object({ slots: Slots.optional() })

const DocumentShape = z.object({
  type: z.literal('document'),
  id: z.string().optional(),
  kind: z.enum(['deck', 'page', 'printed', 'book', 'board']),
  metadata: DocumentMetadata.optional(),
  title: z.string().optional(),
  brand: z.string().optional(),
  limits: DocumentLimitsValue.optional(),
  settings: DocumentSettings.optional(),
  style: DocumentStyle.optional(),
  data: DocumentData.optional(),
  size: PageSize.optional(),
  print: Print.optional(),
  layout: DeckShape.shape.layout.unwrap().optional(),
  fit: DeckShape.shape.fit.unwrap().optional(),
  frame: DeckShape.shape.frame.unwrap().optional(),
  transition: DeckShape.shape.transition,
  playback: DeckShape.shape.playback,
  captions: DeckShape.shape.captions,
  mode: BookMode.optional(),
  page: BookPage.optional(),
  numbering: z.union([BookShape.shape.numbering.unwrap(), NumberSystem]).optional(),
  footnotes: BookShape.shape.footnotes.unwrap().optional(),
  endnotes: BookShape.shape.endnotes.unwrap().optional(),
  rectoOpenings: BookShape.shape.rectoOpenings.unwrap().optional(),
  orphans: BookShape.shape.orphans.unwrap().optional(),
  widows: BookShape.shape.widows.unwrap().optional(),
  fragmentation: BookShape.shape.fragmentation.unwrap().optional(),
  runningHead: BookShape.shape.runningHead.unwrap().optional(),
  rules: PrintedPageRules.optional(),
  children: z.array(DocumentNode),
  parentPages: z.array(ParentPageNode).default([]),
  templates: z.array(TemplateNode).default([]),
  noteSeries: z.array(NoteSeriesNode).default([]),
  variables: z.array(VariableNode).default([]),
  conditions: z.array(ConditionNode).default([]),
})

const definitionCollections = ['parentPages', 'templates', 'noteSeries', 'variables', 'conditions'] as const
const structuralFields = new Set(['type', 'id', 'kind', 'children', ...definitionCollections])

function walk(nodes: DocumentNodeValue[], visit: (node: DocumentNodeValue, path: (string | number)[]) => void, path: (string | number)[] = ['children']): void {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index]
    visit(node, nodePath)
    if ('children' in node) walk(node.children, visit, [...nodePath, 'children'])
  })
}

export const Document = DocumentShape.superRefine((document, ctx) => {
  const profile = DOCUMENT_PROFILES[document.kind]
  for (const [field, value] of Object.entries(document)) {
    if (value !== undefined && !structuralFields.has(field) && !(profile.fields as readonly string[]).includes(field)) {
      ctx.addIssue({ code: 'custom', path: [field], message: profileRefusal(field, document.kind, profile.fields, 'root field') })
    }
  }
  walk(document.children, (node, path) => {
    if (!(profile.children as readonly string[]).includes(node.type)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'type'], message: profileRefusal(node.type, document.kind, profile.children) })
    }
    if (node.type === 'record') {
      ctx.addIssue({ code: 'custom', path, message: `record ${node.name} is not yet supported; remove it to clear this refusal` })
    }
    if (node.type === 'section') {
      if (node.opens === 'continue') {
        ctx.addIssue({ code: 'custom', path: [...path, 'opens'], message: 'section field opens is not yet supported; remove it to clear this refusal' })
      }
      for (const field of ['headTemplate', 'pageGeometry'] as const) {
        if (node[field] !== undefined) {
          ctx.addIssue({ code: 'custom', path: [...path, field], message: `section field ${field} is not yet supported; remove it to clear this refusal` })
        }
      }
    }
  })
  for (const collection of definitionCollections) {
    const values = document[collection]
    if (values.length > 0 && !(profile.definitions as readonly string[]).includes(collection)) {
      ctx.addIssue({ code: 'custom', path: [collection], message: profileRefusal(collection, document.kind, profile.definitions) })
    }
  }
  document.conditions.forEach((condition, index) => {
    ctx.addIssue({ code: 'custom', path: ['conditions', index], message: `condition ${condition.name} is not yet supported; remove it to clear this refusal` })
  })
  document.parentPages.forEach((parent, index) => {
    if (parent.regions !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['parentPages', index, 'regions'],
        message: 'parentPage field regions is not yet supported; remove it to clear this refusal',
      })
    }
  })
  if (document.brand !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['brand'], message: 'document field brand is not yet supported; remove it to clear this refusal' })
  }
  if (document.variables.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['variables'], message: 'document field variables is not yet supported; remove it to clear this refusal' })
  }
  if (document.settings?.dir !== undefined && !(profile.settingsDir as readonly string[]).includes(document.settings.dir)) {
    ctx.addIssue({
      code: 'custom',
      path: ['settings', 'dir'],
      message: profileRefusal(document.settings.dir, document.kind, profile.settingsDir, 'settings.dir value'),
    })
  }
  if (document.limits !== undefined && (document.kind === 'deck' || document.kind === 'board')) {
    ctx.addIssue({ code: 'custom', path: ['limits'], message: 'document field limits is not yet supported; remove it to clear this refusal' })
  }
  if (document.kind === 'page' && (document.children.length !== 1 || document.children[0]?.type !== 'page')) {
    ctx.addIssue({ code: 'custom', path: ['children'], message: 'a page document needs exactly one page node; provide one page node to clear this refusal' })
  }
})

export type Document = z.infer<typeof Document>
export type DocumentInput = z.input<typeof Document>
export type { DocumentKind }
