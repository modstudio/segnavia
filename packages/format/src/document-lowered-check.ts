import type { z } from 'zod'
import type { DocumentShapeValue } from './document.ts'
import { type DocumentBookProjection, documentSourcePath } from './document-book-items.ts'
import { DocumentLoweredBook } from './document-lowered-book.ts'
import { bookLoweringFromDocument, pageLoweringFromDocument } from './document-lowering.ts'
import { Page } from './page.ts'

type Path = (string | number)[]

const BOOK_ROOT_PATHS: Readonly<Record<string, Path>> = {
  title: ['title'],
  authors: ['metadata', 'authors'],
  subject: ['metadata', 'subject'],
  extra: ['metadata', 'extra'],
  limits: ['limits'],
  mode: ['mode'],
  page: ['page'],
  asOf: ['asOf'],
  print: ['print'],
  scripts: ['settings', 'scripts'],
  dir: ['settings', 'dir'],
  lang: ['settings', 'lang'],
  lineNumbers: ['settings', 'lineNumbers'],
  sideNotes: ['settings', 'sideNotes'],
  style: ['style'],
  slots: ['data', 'slots'],
  parentPages: ['parentPages'],
  parentRules: ['parentRules'],
  templates: ['templates'],
  variables: ['variables'],
  headTemplates: ['headTemplates'],
  notes: ['noteSeries'],
  numbering: ['numbering'],
  footnotes: ['footnotes'],
  endnotes: ['endnotes'],
  rectoOpenings: ['rectoOpenings'],
  orphans: ['orphans'],
  widows: ['widows'],
  fragmentation: ['fragmentation'],
  contents: ['children'],
  frontMatter: ['children'],
  body: ['children'],
  chapters: ['children'],
  endMatter: ['children'],
}

const PRINTED_ROOT_PATHS: Readonly<Record<string, Path>> = {
  id: ['children'],
  body: ['children'],
  size: ['size'],
  asOf: ['asOf'],
  print: ['print'],
  limits: ['limits'],
  scripts: ['settings', 'scripts'],
  dir: ['settings', 'dir'],
  lang: ['settings', 'lang'],
  style: ['style'],
  slots: ['data', 'slots'],
}

const PRINTED_PAGES_PATHS: Readonly<Record<string, Path>> = {
  parents: ['parentPages'],
  parentRules: ['parentRules'],
  rules: ['rules'],
  numbering: ['numbering'],
  fragmentation: ['fragmentation'],
  variables: ['variables'],
  headTemplates: ['headTemplates'],
  lineNumbers: ['settings', 'lineNumbers'],
  sideNotes: ['settings', 'sideNotes'],
}

function startsWith(left: Path, right: Path): boolean {
  return right.every((part, index) => left[index] === part)
}

function bookIssuePath(projection: DocumentBookProjection, issuePath: Path): Path {
  const normalized = issuePath[0] === 'chapters' ? ['body', ...issuePath.slice(1)] : issuePath
  for (let length = normalized.length; length > 0; length -= 1) {
    const prefix = normalized.slice(0, length)
    const mapped = documentSourcePath(projection, prefix)
    if (!startsWith(mapped, prefix) || !startsWith(prefix, mapped)) return [...mapped, ...normalized.slice(length)]
  }
  const root = BOOK_ROOT_PATHS[String(issuePath[0])]
  return root ? [...root, ...issuePath.slice(1)] : ['book', ...issuePath]
}

function printedSectionPath(sectionPaths: Path[], issuePath: Path): Path | undefined {
  if (issuePath[0] !== 'printedPages' || issuePath[1] !== 'sections' || typeof issuePath[2] !== 'number') return undefined
  const section = sectionPaths[issuePath[2]]
  return section ? [...section, ...issuePath.slice(3)] : undefined
}

function printedIssuePath(sectionPaths: Path[], issuePath: Path): Path {
  const section = printedSectionPath(sectionPaths, issuePath)
  if (section) return section
  if (issuePath[0] === 'printedPages' && typeof issuePath[1] === 'string') {
    const root = PRINTED_PAGES_PATHS[issuePath[1]]
    if (root) return [...root, ...issuePath.slice(2)]
  }
  const root = PRINTED_ROOT_PATHS[String(issuePath[0])]
  return root ? [...root, ...issuePath.slice(1)] : ['printed', ...issuePath]
}

function addResultIssues(
  result: { success: true } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } },
  path: (issuePath: Path) => Path,
  ctx: z.RefinementCtx,
): void {
  if (result.success) return
  for (const issue of result.error.issues) {
    const issuePath = issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part))
    const mappedPath = path(issuePath)
    ctx.addIssue({ code: 'custom', path: mappedPath, message: issue.message })
  }
}

type LoweredCheck = (document: DocumentShapeValue, ctx: z.RefinementCtx) => void

const LOWERED_CHECKS: Partial<Record<DocumentShapeValue['kind'], LoweredCheck>> = {
  book(document, ctx) {
    const lowering = bookLoweringFromDocument(document)
    addResultIssues(DocumentLoweredBook.safeParse(lowering.value), (path) => bookIssuePath(lowering.projection, path), ctx)
  },
  printed(document, ctx) {
    const lowering = pageLoweringFromDocument(document)
    addResultIssues(Page.safeParse(lowering.value), (path) => printedIssuePath(lowering.sectionPaths, path), ctx)
  },
}

export function refineLoweredDocument(document: DocumentShapeValue, ctx: z.RefinementCtx): void {
  const check = LOWERED_CHECKS[document.kind]
  if (!check) return
  try {
    check(document, ctx)
  } catch (error) {
    ctx.addIssue({ code: 'custom', path: [document.kind], message: error instanceof Error ? error.message : String(error) })
  }
}
