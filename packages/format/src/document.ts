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

const DocumentSettings = z.object({ scripts: Scripts.optional(), dir: DeckShape.shape.dir, lang: z.string().optional() })
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

function refineSettings(document: z.infer<typeof DocumentShape>, profile: (typeof DOCUMENT_PROFILES)[DocumentKind], ctx: z.RefinementCtx): void {
  if (document.settings?.dir !== undefined && !(profile.settingsDir as readonly string[]).includes(document.settings.dir)) {
    ctx.addIssue({
      code: 'custom',
      path: ['settings', 'dir'],
      message: profileRefusal(document.settings.dir, document.kind, profile.settingsDir, 'settings.dir value'),
    })
  }
  for (const [field, value] of Object.entries(document.settings ?? {})) {
    if (value !== undefined && !(profile.settings as readonly string[]).includes(field)) {
      ctx.addIssue({ code: 'custom', path: ['settings', field], message: profileRefusal(field, document.kind, profile.settings, 'settings field') })
    }
  }
}

function refineNamedFields(
  value: Record<string, unknown> | undefined,
  allowed: readonly string[],
  kind: DocumentKind,
  subject: 'metadata' | 'style',
  ctx: z.RefinementCtx,
): void {
  for (const [field, held] of Object.entries(value ?? {})) {
    if (held !== undefined && !allowed.includes(field)) {
      ctx.addIssue({ code: 'custom', path: [subject, field], message: profileRefusal(field, kind, allowed, `${subject} field`) })
    }
  }
}

function visibleTitle(document: z.infer<typeof DocumentShape>): boolean {
  return document.metadata?.title !== undefined || document.title !== undefined
}

function unsupported(path: (string | number)[], subject: string, ctx: z.RefinementCtx): void {
  ctx.addIssue({ code: 'custom', path, message: `${subject} is not yet supported; remove it to clear this refusal` })
}

function refineBookNodes(document: z.infer<typeof DocumentShape>, ctx: z.RefinementCtx): void {
  const divisions = document.children.filter((node) => node.type === 'division')
  if (divisions.length > 0 && divisions.length !== document.children.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message: 'a book document cannot mix division nodes with other top-level nodes; move every top-level entry into a division or remove the divisions to clear this refusal',
    })
  }
  let contentsOptions = 0
  const entries = (nodes: DocumentNodeValue[], division: 'front' | 'body' | 'end', path: (string | number)[]): void => {
    nodes.forEach((node, index) => {
      const nodePath = [...path, index]
      if (node.type === 'division') {
        ctx.addIssue({
          code: 'custom',
          path: [...nodePath, 'type'],
          message: 'a division node is only allowed at the book root; move it to the root or remove it to clear this refusal',
        })
        return
      }
      if (node.type === 'part') {
        entries(node.children, division, [...nodePath, 'children'])
        return
      }
      if (node.type === 'section') {
        const kinds = new Set(node.children.map((child) => child.type))
        if (kinds.size !== 1 || !['page', 'flow', 'placed'].includes(node.children[0]?.type ?? '')) {
          ctx.addIssue({
            code: 'custom',
            path: [...nodePath, 'children'],
            message: 'a book section needs only page nodes, one flow node or one placed node; keep one supported child form to clear this refusal',
          })
        }
        if ((kinds.has('flow') || kinds.has('placed')) && node.children.length !== 1) {
          ctx.addIssue({
            code: 'custom',
            path: [...nodePath, 'children'],
            message: 'a flowing or placed book section needs exactly one child; keep one child to clear this refusal',
          })
        }
        if (node.children[0]?.type === 'flow' && division === 'body' && node.title === undefined && node.children[0].title === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [...nodePath, 'title'],
            message: 'a body section needs a title; provide section.title or flow.title to clear this refusal',
          })
        }
        const pages = node.children.filter((child) => child.type === 'page')
        const templated = pages.some((page) => page.regions !== undefined)
        if (node.template !== undefined && !templated) unsupported([...nodePath, 'template'], 'non-templated section field template', ctx)
        if (templated && pages.some((page) => page.regions === undefined)) {
          ctx.addIssue({
            code: 'custom',
            path: [...nodePath, 'children'],
            message: 'a templated section needs regions on every page; add regions to every page or remove them from every page to clear this refusal',
          })
        }
        if (templated && node.template === undefined) {
          ctx.addIssue({ code: 'custom', path: [...nodePath, 'template'], message: 'a templated section needs template; name a template to clear this refusal' })
        }
        pages.forEach((page, pageIndex) => {
          if (templated && page.body !== undefined) unsupported([...nodePath, 'children', pageIndex, 'body'], 'templated page field body', ctx)
          if (!templated && page.template !== undefined) unsupported([...nodePath, 'children', pageIndex, 'template'], 'designed page field template', ctx)
          if (!templated && (!page.body || !('html' in page.body))) {
            ctx.addIssue({
              code: 'custom',
              path: [...nodePath, 'children', pageIndex, 'body'],
              message: 'a designed book page needs body.html; provide an HTML body to clear this refusal',
            })
          }
        })
        const flow = node.children[0]?.type === 'flow' ? node.children[0] : undefined
        if (flow && node.title !== undefined && flow.title !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [...nodePath, 'children', 0, 'title'],
            message: 'section.title and flow.title were both given; keep section.title and remove flow.title to clear this refusal',
          })
        }
        if (flow && division === 'body' && node.contents === false) {
          unsupported([...nodePath, 'contents'], 'body flow section field contents', ctx)
        }
        return
      }
      if (!['contents', 'flow', 'placed'].includes(node.type)) {
        ctx.addIssue({
          code: 'custom',
          path: [...nodePath, 'type'],
          message: `node ${node.type} cannot lower to a book entry; put it inside a supported section to clear this refusal`,
        })
      }
      if (node.type === 'contents' && (node.depth !== undefined || node.pageNumbers !== undefined)) {
        contentsOptions += 1
        if (contentsOptions > 1) {
          ctx.addIssue({
            code: 'custom',
            path: node.depth !== undefined ? [...nodePath, 'depth'] : [...nodePath, 'pageNumbers'],
            message: 'only one contents node may set depth or pageNumbers; keep those options on one contents node to clear this refusal',
          })
        }
      }
      if (node.type === 'flow' && division === 'body' && node.title === undefined) {
        ctx.addIssue({ code: 'custom', path: [...nodePath, 'title'], message: 'a body flow needs a title; provide title to clear this refusal' })
      }
    })
  }
  if (divisions.length > 0) {
    divisions.forEach((division, index) => {
      if (division.settings?.numbering !== undefined) {
        unsupported(['children', index, 'settings', 'numbering'], 'division field settings.numbering', ctx)
      }
      entries(division.children, division.name, ['children', index, 'children'])
    })
  }
  else entries(document.children, 'body', ['children'])
}

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
    if (node.type === 'page') {
      for (const field of ['body', 'template', 'regions'] as const) {
        if (node[field] !== undefined && !(profile.pageFields as readonly string[]).includes(field)) {
          ctx.addIssue({ code: 'custom', path: [...path, field], message: profileRefusal(field, document.kind, profile.pageFields, 'page field') })
        }
      }
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
      if (node.numbering !== undefined) unsupported([...path, 'numbering'], 'section field numbering', ctx)
    }
    if (profile.childIds && node.id === undefined) {
      ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `${node.type} field id is required in a ${document.kind} document; provide id to clear this refusal` })
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
  refineSettings(document, profile, ctx)
  refineNamedFields(document.metadata, profile.metadata, document.kind, 'metadata', ctx)
  refineNamedFields(document.style, profile.style, document.kind, 'style', ctx)
  if (document.limits !== undefined && (document.kind === 'deck' || document.kind === 'board')) {
    ctx.addIssue({ code: 'custom', path: ['limits'], message: 'document field limits is not yet supported; remove it to clear this refusal' })
  }
  if (document.title !== undefined && document.metadata?.title !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['title'], message: 'root title and metadata.title were both given; keep metadata.title and remove root title to clear this refusal' })
  }
  for (const requirement of profile.required) {
    const present =
      requirement === 'title'
        ? visibleTitle(document)
        : requirement === 'mode'
          ? document.mode !== undefined
          : requirement === 'page.body'
            ? document.children[0]?.type === 'page' && document.children[0].body !== undefined
            : requirement === 'parentPages'
              ? document.parentPages.length > 0
              : requirement === 'rules'
                ? document.rules !== undefined
                : document.settings?.dir !== undefined
    if (!present) {
      const path = requirement.split('.')
      ctx.addIssue({
        code: 'custom',
        path,
        message: profileRefusal(requirement, document.kind, [requirement], 'required field'),
      })
    }
  }
  if (profile.requiredWhen && document[profile.requiredWhen.when[0]] === profile.requiredWhen.when[1] && document[profile.requiredWhen.field] === undefined) {
    const requirement = profile.requiredWhen.field
    ctx.addIssue({ code: 'custom', path: [requirement], message: profileRefusal(requirement, document.kind, [requirement], 'required field') })
  }
  if (profile.childCount && 'exact' in profile.childCount && (document.children.length !== profile.childCount.exact || document.children[0]?.type !== profile.childCount.node)) {
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message: `a ${document.kind} document needs exactly ${profile.childCount.exact} ${profile.childCount.node} node; provide it to clear this refusal`,
    })
  }
  if (profile.childCount && 'min' in profile.childCount && document.children.length < profile.childCount.min) {
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message: `a ${document.kind} document needs at least ${profile.childCount.min} ${profile.childCount.node}; add one to clear this refusal`,
    })
  }
  if ((profile.required as readonly string[]).includes('page.body') && document.children[0]?.type === 'page' && document.children[0].body === undefined) {
    ctx.addIssue({ code: 'custom', path: ['children', 0, 'body'], message: `a ${document.kind} document needs a page body; provide body to clear this refusal` })
  }
  if (profile.numbering === 'book' && typeof document.numbering === 'string') {
    ctx.addIssue({ code: 'custom', path: ['numbering'], message: profileRefusal(document.numbering, document.kind, ['frontMatter/body numbering'], 'numbering value') })
  }
  if (profile.numbering === 'printed' && typeof document.numbering === 'object') {
    ctx.addIssue({ code: 'custom', path: ['numbering'], message: profileRefusal('book numbering', document.kind, ['a number system'], 'numbering value') })
  }
  if (profile.topology === 'book') refineBookNodes(document, ctx)
}).transform((document) => {
  const profile = DOCUMENT_PROFILES[document.kind]
  const withScripts = document.settings === undefined || !(profile.settings as readonly string[]).includes('scripts')
    ? document
    : { ...document, settings: { scripts: 'refuse' as const, ...document.settings } }
  if (!profile.canonicalChildren) return withScripts
  const children = profile.canonicalChildren.flatMap((type) => withScripts.children.filter((node) => node.type === type))
  return { ...withScripts, children }
})

export type Document = z.infer<typeof Document>
export type DocumentInput = z.input<typeof Document>
export type { DocumentKind }
