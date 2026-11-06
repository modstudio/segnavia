import {
  Book,
  type BookInput,
  type BookItem,
  bookFromDocument,
  Document,
  type Document as DocumentValue,
  type DocumentInput,
  isBookContents,
  isDesignedSection,
  isPart,
  isTemplatedSection,
} from '@segnavia/format'

type Node = DocumentValue['children'][number]

function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function node(entry: BookItem): Node {
  if (isPart(entry)) {
    return defined({
      type: 'part' as const,
      name: entry.name,
      title: entry.title,
      html: entry.html,
      contents: entry.contents,
      opens: entry.opens,
      parents: entry.parents,
      runningHead: entry.runningHead,
      children: entry.children.map(node),
    })
  }
  if (isBookContents(entry)) {
    return defined({ type: 'contents' as const, title: entry.title, opens: entry.opens, parents: entry.parents })
  }
  if (isDesignedSection(entry)) {
    return defined({
      type: 'section' as const,
      title: entry.title,
      contents: entry.contents,
      opens: entry.opens,
      parents: entry.parents,
      children: entry.pages.map((page) => ({ type: 'page' as const, body: { html: page.html } })),
    })
  }
  if (isTemplatedSection(entry)) {
    return defined({
      type: 'section' as const,
      title: entry.title,
      contents: entry.contents,
      opens: entry.opens,
      parents: entry.parents,
      template: entry.template,
      children: entry.pages.map((page) => defined({ type: 'page' as const, template: page.template, regions: page.regions })),
    })
  }
  if ('kind' in entry && entry.kind === 'placed') {
    return defined({ type: 'section' as const, title: entry.title, contents: entry.contents, opens: entry.opens, parents: entry.parents, children: [{ type: 'placed', ...entry.placement }] })
  }
  if ('html' in entry) {
    return defined({
      type: 'section' as const,
      title: entry.title,
      contents: 'contents' in entry ? entry.contents : true,
      opens: entry.opens,
      parents: entry.parents,
      children: [{ type: 'flow' as const, html: entry.html, title: entry.title, runningHead: 'runningHead' in entry ? entry.runningHead : undefined }],
    })
  }
  throw new Error('The book fixture contains an entry that cannot be authored as a Document node.')
}

export function bookDocumentFixture(input: BookInput): DocumentInput {
  const book = Book.parse(input)
  const division = (name: 'front' | 'body' | 'end', entries: BookItem[]): Node => ({ type: 'division', name, children: entries.map(node) })
  return defined({
    type: 'document' as const,
    kind: 'book' as const,
    metadata: defined({ title: book.title, authors: book.authors, subject: book.subject }),
    settings: defined({ scripts: book.scripts, dir: book.dir, lang: book.lang }),
    style: defined({ css: book.css, fonts: book.fonts }),
    data: defined({ slots: book.slots }),
    mode: book.mode,
    limits: book.limits,
    page: book.page,
    numbering: book.numbering,
    footnotes: book.footnotes,
    endnotes: book.endnotes,
    rectoOpenings: book.rectoOpenings,
    orphans: book.orphans,
    widows: book.widows,
    fragmentation: book.fragmentation,
    runningHead: book.runningHead,
    parentPages: book.parentPages.map(({ margin, ...parent }) => ({ type: 'parentPage' as const, ...parent, geometry: { margin } })),
    templates: book.templates.map((template) => ({ type: 'template' as const, ...template })),
    noteSeries: book.notes.map((series) => ({ type: 'noteSeries' as const, ...series })),
    children: [division('front', book.frontMatter), division('body', book.body), division('end', book.endMatter)],
  })
}

export function bookFixtureValue(input: DocumentInput) {
  return bookFromDocument(Document.parse(input))
}
