import type { BookDivisions, BookItem } from './book-section.ts'
import type { DocumentNode } from './document-nodes.ts'

type Division = 'front' | 'body' | 'end'
type Path = (string | number)[]

export const SECTION_CONTENTS_DEFAULT = true

export interface DocumentBookProjection {
  divisions: BookDivisions
  sourcePaths: Map<string, Path>
}

function pathKey(path: Path): string {
  return JSON.stringify(path)
}

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function nodeId(node: { id?: string; title?: string }, path: Path): string {
  return node.id ?? node.title ?? path.join('.')
}

export function documentSectionFields(section: Extract<DocumentNode, { type: 'section' }>, path: Path) {
  return defined({
    id: nodeId(section, path),
    title: section.title,
    contentsLabel: section.contentsLabel,
    subtitle: section.subtitle,
    contents: section.contents ?? SECTION_CONTENTS_DEFAULT,
    opens: section.opens,
    parents: section.parents,
    numbering: section.numbering,
    pageGeometry: section.pageGeometry,
    lang: section.lang,
    dir: section.dir,
  })
}

function pageHtml(node: Extract<DocumentNode, { type: 'page' }>): string {
  if (node.body && 'html' in node.body) return node.body.html
  throw new Error('a book page needs an HTML body; provide body.html to clear this refusal')
}

function placement(node: Extract<DocumentNode, { type: 'placed' }>) {
  const { type: _type, id: _id, ...value } = node
  return value
}

function sectionItem(section: Extract<DocumentNode, { type: 'section' }>, division: Division, bookPath: Path): BookItem {
  const fields = documentSectionFields(section, bookPath)
  const pages = section.children.filter((node): node is Extract<DocumentNode, { type: 'page' }> => node.type === 'page')
  if (pages.length > 0 && pages.every((page) => page.regions !== undefined)) {
    const template = section.template
    if (!template) throw new Error('a templated section needs template; name a template to clear this refusal')
    return {
      kind: 'templated',
      ...fields,
      template,
      pages: pages.map((page) => defined({ template: page.template, regions: page.regions ?? {} })),
    }
  }
  if (pages.length > 0) return { kind: 'designed', ...fields, pages: pages.map((page) => ({ html: pageHtml(page) })) }
  const placed = section.children.find((node): node is Extract<DocumentNode, { type: 'placed' }> => node.type === 'placed')
  if (placed) return { kind: 'placed', ...fields, placement: placement(placed) }
  const flow = section.children.find((node): node is Extract<DocumentNode, { type: 'flow' }> => node.type === 'flow')
  if (flow) {
    const flowFields = division === 'body' ? { ...fields, contents: undefined } : fields
    return defined({ ...flowFields, title: section.title ?? flow.title, html: flow.html, runningHead: flow.runningHead }) as BookItem
  }
  throw new Error('a section needs a flow, page or placed child; add one to clear this refusal')
}

function partItem(
  part: Extract<DocumentNode, { type: 'part' }>,
  division: Division,
  sourcePath: Path,
  bookPath: Path,
  sourcePaths: Map<string, Path>,
): BookItem {
  return defined({
    id: nodeId(part, bookPath),
    name: part.name,
    title: part.title,
    html: part.html,
    contents: part.contents,
    opens: part.opens,
    parents: part.parents,
    runningHead: part.runningHead,
    children: part.children.map((child, index) => bookItem(child, division, [...sourcePath, 'children', index], [...bookPath, 'children', index], sourcePaths)),
  }) as BookItem
}

function bookItem(node: DocumentNode, division: Division, sourcePath: Path, bookPath: Path, sourcePaths: Map<string, Path>): BookItem {
  sourcePaths.set(pathKey(bookPath), sourcePath)
  if (node.type === 'part') return partItem(node, division, sourcePath, bookPath, sourcePaths)
  if (node.type === 'section') return sectionItem(node, division, bookPath)
  if (node.type === 'contents')
    return defined({
      id: nodeId(node, bookPath),
      kind: 'contents',
      title: node.title,
      opens: node.opens,
      parents: node.parents,
      numbering: node.numbering,
    }) as BookItem
  if (node.type === 'flow') return defined({ id: nodeId(node, bookPath), title: node.title, html: node.html, runningHead: node.runningHead }) as BookItem
  if (node.type === 'placed') return { id: nodeId(node, bookPath), kind: 'placed', contents: true, placement: placement(node) }
  throw new Error(`node ${node.type} cannot lower to a book entry; put it inside a section to clear this refusal`)
}

export function documentBookProjection(document: { children: DocumentNode[] }): DocumentBookProjection {
  const sourcePaths = new Map<string, Path>()
  const divisions = document.children.filter((node): node is Extract<DocumentNode, { type: 'division' }> => node.type === 'division')
  if (divisions.length === 0) {
    const body = document.children.map((node, index) => bookItem(node, 'body', ['children', index], ['body', index], sourcePaths))
    return { divisions: { frontMatter: [], body, endMatter: [] }, sourcePaths }
  }
  const entries = (name: Division, key: 'frontMatter' | 'body' | 'endMatter') => {
    const result: BookItem[] = []
    document.children.forEach((node, divisionIndex) => {
      if (node.type !== 'division' || node.name !== name) return
      node.children.forEach((child, childIndex) => {
        const index = result.length
        result.push(bookItem(child, name, ['children', divisionIndex, 'children', childIndex], [key, index], sourcePaths))
      })
    })
    return result
  }
  return {
    divisions: { frontMatter: entries('front', 'frontMatter'), body: entries('body', 'body'), endMatter: entries('end', 'endMatter') },
    sourcePaths,
  }
}

export function documentBookDivisions(document: { children: DocumentNode[] }): BookDivisions {
  return documentBookProjection(document).divisions
}

export function documentBookProjectionForRefinement(document: { children: DocumentNode[] }): DocumentBookProjection | undefined {
  try {
    return documentBookProjection(document)
  } catch {
    return undefined
  }
}

export function documentSourcePath(projection: DocumentBookProjection, bookPath: Path): Path {
  return projection.sourcePaths.get(pathKey(bookPath)) ?? bookPath
}
