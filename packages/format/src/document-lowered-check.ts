import type { z } from 'zod'
import { Book } from './book.ts'
import { documentBookProjection, documentSourcePath } from './document-book-items.ts'
import { bookInputFromDocument, pageInputFromDocument } from './document-lowering.ts'
import { Page } from './page.ts'

type Path = (string | number)[]
type LowerableDocument = Parameters<typeof bookInputFromDocument>[0]

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
}

function startsWith(left: Path, right: Path): boolean {
  return right.every((part, index) => left[index] === part)
}

function bookIssuePath(document: LowerableDocument, issuePath: Path): Path {
  const projection = documentBookProjection(document)
  const normalized = issuePath[0] === 'chapters' ? ['body', ...issuePath.slice(1)] : issuePath
  for (let length = normalized.length; length > 0; length -= 1) {
    const prefix = normalized.slice(0, length)
    const mapped = documentSourcePath(projection, prefix)
    if (!startsWith(mapped, prefix) || !startsWith(prefix, mapped)) return [...mapped, ...normalized.slice(length)]
  }
  const root = BOOK_ROOT_PATHS[String(issuePath[0])]
  return root ? [...root, ...issuePath.slice(1)] : ['book', ...issuePath]
}

function printedSectionPath(document: LowerableDocument, issuePath: Path): Path | undefined {
  if (issuePath[0] !== 'printedPages' || issuePath[1] !== 'sections' || typeof issuePath[2] !== 'number') return undefined
  const sectionPaths = document.children.flatMap((node, index) => (node.type === 'section' || node.type === 'record' ? [['children', index] as Path] : []))
  const section = sectionPaths[issuePath[2]]
  return section ? [...section, ...issuePath.slice(3)] : undefined
}

function printedIssuePath(document: LowerableDocument, issuePath: Path): Path {
  const section = printedSectionPath(document, issuePath)
  if (section) return section
  if (issuePath[0] === 'printedPages' && typeof issuePath[1] === 'string') {
    const root = PRINTED_PAGES_PATHS[issuePath[1]]
    if (root) return [...root, ...issuePath.slice(2)]
  }
  const root = PRINTED_ROOT_PATHS[String(issuePath[0])]
  return root ? [...root, ...issuePath.slice(1)] : ['printed', ...issuePath]
}

function addResultIssues(
  result: ReturnType<typeof Book.safeParse> | ReturnType<typeof Page.safeParse>,
  path: (issuePath: Path) => Path,
  ctx: z.RefinementCtx,
): void {
  if (result.success) return
  for (const issue of result.error.issues) {
    const issuePath = issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part))
    ctx.addIssue({ code: 'custom', path: path(issuePath), message: issue.message })
  }
}

export function refineLoweredDocument(document: LowerableDocument, ctx: z.RefinementCtx): void {
  try {
    if (document.kind === 'book') {
      addResultIssues(Book.safeParse(bookInputFromDocument(document)), (path) => bookIssuePath(document, path), ctx)
    } else if (document.kind === 'printed') {
      addResultIssues(Page.safeParse(pageInputFromDocument(document, true)), (path) => printedIssuePath(document, path), ctx)
    }
  } catch (error) {
    ctx.addIssue({ code: 'custom', path: [document.kind], message: error instanceof Error ? error.message : String(error) })
  }
}
