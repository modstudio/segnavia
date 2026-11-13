import { z } from 'zod'
import { AsOf } from './as-of.ts'
import { BookMode, BookPage, BookShape } from './book.ts'
import { closedObject } from './closed-object.ts'
import { DeckShape, deckTrim } from './deck.ts'
import { SECTION_CONTENTS_DEFAULT } from './document-book-items.ts'
import { refineBookNodes } from './document-book-refinement.ts'
import { refineDocumentEditions } from './document-edition-refinement.ts'
import { refineUnsupportedDocumentFields } from './document-field-refinement.ts'
import { type DocumentParseOptions, type IdentifiedDocument, identifyDocument } from './document-identity.ts'
import { refineLoweredDocument } from './document-lowered-check.ts'
import { DocumentMetadata } from './document-metadata.ts'
import { refineDocumentNodes } from './document-node-refinement.ts'
import { DocumentNode, type DocumentNode as DocumentNodeValue } from './document-nodes.ts'
import { ConditionNode, EditionNode, HeadTemplateNode, NoteSeriesNode, ParentPageNode, TemplateNode, VariableNode } from './document-nodes-book.ts'
import { documentPageGeometryIssues } from './document-page-geometry-policy.ts'
import { DOCUMENT_KINDS, DOCUMENT_PROFILES, type DocumentKind, profileRefusal, requiredFieldRefusal } from './document-profile.ts'
import { refineDocumentVariables } from './document-variable-refinement.ts'
import { refineLibraryNames } from './library-names.ts'
import { DocumentLimitsValue } from './limits.ts'
import { LineNumbers, SideNotes } from './line-numbers.ts'
import { LogicalMargin } from './margins.ts'
import { defaultPageNumbering, NumberSystem } from './numbering.ts'
import { DEFAULT_OUTLINE_DEPTH, Outline } from './outline.ts'
import { PageSize } from './page.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'
import { parentRules } from './parent-rules.ts'
import { Print, pressGeometryFields, pressSafeAreaIssues, refinePressGeometry } from './print.ts'
import { Scripts } from './scripts.ts'
import { type SectionNumberingFact, sectionNumberingIssues } from './section-numbering-policy.ts'
import { Slots } from './slots.ts'
import { StyleSheet } from './style-sheet.ts'

const DocumentSettings = closedObject({
  scripts: Scripts.optional(),
  dir: DeckShape.shape.dir,
  lang: z.string().optional(),
  lineNumbers: LineNumbers.optional(),
  sideNotes: SideNotes.optional(),
})
const DocumentData = closedObject({ slots: Slots.optional() })
const DocumentPrint = closedObject({
  ...pressGeometryFields,
  paper: Paper.optional(),
  orientation: Orientation.optional(),
  margin: LogicalMargin.optional(),
}).superRefine(refinePressGeometry)

export const DocumentShape = closedObject({
  type: z.literal('document'),
  id: z.string().optional(),
  kind: z.enum(DOCUMENT_KINDS),
  metadata: DocumentMetadata.optional(),
  title: z.string().optional(),
  brand: z.string().optional(),
  limits: DocumentLimitsValue.optional(),
  settings: DocumentSettings.optional(),
  style: StyleSheet.optional(),
  data: DocumentData.optional(),
  size: PageSize.optional(),
  asOf: AsOf.optional(),
  print: DocumentPrint.optional(),
  layout: DeckShape.shape.layout.unwrap().optional(),
  fit: DeckShape.shape.fit.unwrap().optional(),
  frame: DeckShape.shape.frame.unwrap().optional(),
  transition: DeckShape.shape.transition,
  playback: DeckShape.shape.playback,
  captions: DeckShape.shape.captions,
  readingSpeed: DeckShape.shape.readingSpeed,
  mode: BookMode.optional(),
  outline: Outline.optional(),
  page: BookPage.optional(),
  numbering: z.union([BookShape.shape.numbering.unwrap(), NumberSystem]).optional(),
  footnotes: BookShape.shape.footnotes.unwrap().optional(),
  endnotes: BookShape.shape.endnotes.unwrap().optional(),
  rectoOpenings: BookShape.shape.rectoOpenings.unwrap().optional(),
  orphans: BookShape.shape.orphans.unwrap().optional(),
  widows: BookShape.shape.widows.unwrap().optional(),
  fragmentation: BookShape.shape.fragmentation.unwrap().optional(),
  parentRules: parentRules.optional(),
  rules: z.unknown().optional(),
  children: z.array(DocumentNode),
  parentPages: z.array(ParentPageNode).default([]),
  templates: z.array(TemplateNode).default([]),
  noteSeries: z.array(NoteSeriesNode).default([]),
  variables: z.array(VariableNode).default([]),
  headTemplates: z.array(HeadTemplateNode).default([]),
  conditions: z
    .array(ConditionNode)
    .default([])
    .superRefine((conditions, ctx) => refineLibraryNames('condition', conditions, ctx)),
  editions: z
    .array(EditionNode)
    .default([])
    .superRefine((editions, ctx) => refineLibraryNames('edition', editions, ctx)),
  defaultEdition: z.string().optional(),
})

export const definitionCollections = ['parentPages', 'templates', 'noteSeries', 'variables', 'headTemplates', 'conditions', 'editions'] as const
export const documentStructuralFields = ['type', 'id', 'kind', 'children'] as const
const structuralFields: ReadonlySet<string> = new Set([...documentStructuralFields, ...definitionCollections])

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

function documentNumberedSections(document: DocumentShapeValue): SectionNumberingFact[] {
  const sections: SectionNumberingFact[] = []
  const collect = (nodes: DocumentNodeValue[], division: 'front' | 'body' | 'end', path: (string | number)[]): void => {
    nodes.forEach((node, index) => {
      const nodePath = [...path, index]
      const heldDivision = node.type === 'division' ? node.name : division
      if ((node.type === 'section' || node.type === 'contents') && node.numbering !== undefined) {
        const id = node.id ?? node.title ?? nodePath.join('.')
        sections.push({ id, title: node.title, division: heldDivision, path: nodePath, numbering: node.numbering })
      }
      if ('children' in node && node.children !== undefined) collect(node.children, heldDivision, [...nodePath, 'children'])
    })
  }
  collect(document.children, 'body', ['children'])
  return sections
}

// Page does not check printed section numbering restarts, so printed documents establish them here.
function refinePrintedSectionNumbering(document: DocumentShapeValue, ctx: z.RefinementCtx): void {
  if (document.kind !== 'printed') return
  const system = typeof document.numbering === 'string' ? document.numbering : defaultPageNumbering(document.settings?.lang)
  for (const issue of sectionNumberingIssues({
    mode: document.mode ?? 'paginated',
    systems: { frontMatter: system, body: system },
    sections: documentNumberedSections(document),
  })) {
    ctx.addIssue({ code: 'custom', ...issue })
  }
}

export type DocumentShapeValue = z.infer<typeof DocumentShape>
type DocumentProfile = (typeof DOCUMENT_PROFILES)[DocumentKind]

function refineRootFields(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const [field, value] of Object.entries(document)) {
    if (value !== undefined && !structuralFields.has(field) && !(profile.fields as readonly string[]).includes(field)) {
      ctx.addIssue({ code: 'custom', path: [field], message: profileRefusal(field, document.kind, profile.fields, 'root field') })
    }
  }
}

function refineDefinitions(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const collection of definitionCollections) {
    const values = document[collection]
    if (values.length > 0 && !(profile.definitions as readonly string[]).includes(collection)) {
      ctx.addIssue({ code: 'custom', path: [collection], message: profileRefusal(collection, document.kind, profile.definitions) })
    }
  }
}

function requirementPresent(document: DocumentShapeValue, requirement: string): boolean {
  if (requirement === 'title') return visibleTitle(document)
  if (requirement === 'mode') return document.mode !== undefined
  if (requirement === 'page.body') return document.children[0]?.type === 'page' && document.children[0].body !== undefined
  if (requirement === 'parentPages') return document.parentPages.length > 0
  if (requirement === 'parentRules') return document.parentRules !== undefined
  return document.settings?.dir !== undefined
}

function refineRequirements(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  for (const requirement of profile.required) {
    if (!requirementPresent(document, requirement)) {
      ctx.addIssue({
        code: 'custom',
        path: requirement.split('.'),
        message: requiredFieldRefusal(requirement, document.kind),
      })
    }
  }
}

function refineChildCount(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  if (profile.childForms) {
    const matches = profile.childForms.forms.some((form) => {
      if (document.children.some((node) => !(form.nodes as readonly string[]).includes(node.type))) return false
      return 'exact' in form ? document.children.length === form.exact : document.children.length >= form.min
    })
    if (!matches) ctx.addIssue({ code: 'custom', path: ['children'], message: profile.childForms.message })
  }
  if (
    profile.childCount &&
    'exact' in profile.childCount &&
    (document.children.length !== profile.childCount.exact || document.children[0]?.type !== profile.childCount.node)
  ) {
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
}

function refineProfileShape(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  refineSettings(document, profile, ctx)
  refineNamedFields(document.metadata, profile.metadata, document.kind, 'metadata', ctx)
  refineNamedFields(document.style, profile.style, document.kind, 'style', ctx)
  if (document.limits !== undefined && (document.kind === 'deck' || document.kind === 'board')) {
    ctx.addIssue({ code: 'custom', path: ['limits'], message: 'document field limits is not yet supported; remove it to clear this refusal' })
  }
  if (document.title !== undefined && document.metadata?.title !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['title'],
      message: 'root title and metadata.title were both given; keep metadata.title and remove root title to clear this refusal',
    })
  }
  refineRequirements(document, profile, ctx)
  refineChildCount(document, profile, ctx)
  if ((profile.required as readonly string[]).includes('page.body') && document.children[0]?.type === 'page' && document.children[0].body === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['children', 0, 'body'],
      message: `a ${document.kind} document needs a page body; provide body to clear this refusal`,
    })
  }
  if (profile.numbering === 'book' && typeof document.numbering === 'string') {
    ctx.addIssue({
      code: 'custom',
      path: ['numbering'],
      message: profileRefusal(document.numbering, document.kind, ['frontMatter/body numbering'], 'numbering value'),
    })
  }
  if (profile.numbering === 'printed' && typeof document.numbering === 'object') {
    ctx.addIssue({ code: 'custom', path: ['numbering'], message: profileRefusal('book numbering', document.kind, ['a number system'], 'numbering value') })
  }
  if (profile.topology === 'book') refineBookNodes(document, ctx)
}

function pressTrim(document: DocumentShapeValue, profile: DocumentProfile): { width: number; height: number } | undefined {
  if (profile.printTrimSource === 'bookPage') return document.page ? sheetMm(document.page) : undefined
  if (profile.printTrimSource !== 'deckSize') return undefined
  return deckTrim(
    typeof document.size === 'object' && typeof document.size.width === 'number' && typeof document.size.height === 'number' ? document.size : undefined,
  )
}

function refinePrint(document: DocumentShapeValue, profile: DocumentProfile, ctx: z.RefinementCtx): void {
  const print = document.print
  if (!print) return
  if (profile.printShape === 'none') {
    ctx.addIssue({ code: 'custom', path: ['print'], message: `${profile.printTrim}; remove print to clear this refusal` })
    return
  }
  for (const field of ['paper', 'orientation', 'margin'] as const) {
    if (profile.printShape === 'press' && print[field] !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['print', field],
        message: `print.${field} is not accepted because ${profile.printTrim}; remove print.${field} to clear this refusal`,
      })
    }
  }
  const paper = profile.printShape === 'paper' ? Print.safeParse(print) : undefined
  if (paper && !paper.success) {
    for (const issue of paper.error.issues) ctx.addIssue({ code: 'custom', path: ['print', ...issue.path], message: issue.message })
    return
  }
  const trim = pressTrim(document, profile)
  if (trim) for (const message of pressSafeAreaIssues(print, trim)) ctx.addIssue({ code: 'custom', path: ['print', 'safe'], message })
}

export function defaultSectionContents(nodes: DocumentNodeValue[], enabled: boolean): DocumentNodeValue[] {
  return nodes.map((node) => {
    if (!('children' in node) || node.children === undefined) return node
    const children = defaultSectionContents(node.children, enabled)
    if (node.type === 'section' && enabled && node.contents === undefined) return { ...node, contents: SECTION_CONTENTS_DEFAULT, children }
    return { ...node, children }
  })
}

function normalizedDocument(document: DocumentShapeValue): DocumentShapeValue {
  const profile = DOCUMENT_PROFILES[document.kind]
  const withSectionDefaults = {
    ...document,
    ...((document.kind === 'book' || document.kind === 'printed') && document.outline === undefined ? { outline: { depth: DEFAULT_OUTLINE_DEPTH } } : {}),
    children: defaultSectionContents(document.children, (profile.sectionFields as readonly string[]).includes('contents')),
  }
  const withScripts =
    withSectionDefaults.settings === undefined || !(profile.settings as readonly string[]).includes('scripts')
      ? withSectionDefaults
      : { ...withSectionDefaults, settings: { scripts: 'refuse' as const, ...withSectionDefaults.settings } }
  if (!profile.canonicalChildren) return withScripts
  const children = profile.canonicalChildren.flatMap((type) => withScripts.children.filter((node) => node.type === type))
  return { ...withScripts, children }
}

const DocumentSchema = DocumentShape.superRefine((document, ctx) => {
  const profile = DOCUMENT_PROFILES[document.kind]
  refinePrintedSectionNumbering(document, ctx)
  for (const issue of documentPageGeometryIssues(document)) ctx.addIssue({ code: 'custom', ...issue })
  refineRootFields(document, profile, ctx)
  refineDocumentNodes(document, profile, ctx)
  refineDefinitions(document, profile, ctx)
  refineDocumentEditions(document, ctx)
  refineUnsupportedDocumentFields(document, ctx)
  refineDocumentVariables({ ...document, lang: document.settings?.lang }, ctx)
  refineProfileShape(document, profile, ctx)
  refinePrint(document, profile, ctx)
  refineLoweredDocument(normalizedDocument(document), ctx)
}).transform(normalizedDocument)

export type DocumentInput = z.input<typeof DocumentSchema>
export type Document = IdentifiedDocument<z.infer<typeof DocumentSchema>>
export type { DocumentParseOptions }

export const DocumentField = DocumentSchema.transform((document) => identifyDocument(document))

const schemaParse = DocumentSchema.parse.bind(DocumentSchema)
const schemaSafeParse = DocumentSchema.safeParse.bind(DocumentSchema)

type DocumentSchemaWithIds = Omit<typeof DocumentSchema, 'parse' | 'safeParse'> & {
  parse(input: unknown, options?: DocumentParseOptions): Document
  safeParse(input: unknown, options?: DocumentParseOptions): { success: true; data: Document } | { success: false; error: unknown }
}

export const Document = Object.assign(DocumentSchema, {
  parse(input: unknown, options?: DocumentParseOptions): Document {
    return identifyDocument(schemaParse(input), options)
  },
  safeParse(input: unknown, options?: DocumentParseOptions) {
    const result = schemaSafeParse(input)
    if (!result.success) return result
    try {
      return { success: true as const, data: identifyDocument(result.data, options) }
    } catch (error) {
      return { success: false as const, error }
    }
  },
}) as DocumentSchemaWithIds
export type { DocumentKind }
