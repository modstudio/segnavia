import { bookFromDocument, type Document, type OutlineHeading, type OutlineSource, printedFromDocument, resolveDirection } from '@segnavia/format'
import { type ChildNode, isTag } from 'domhandler'
import { bookDocument } from './book/book-document.ts'
import { headingText } from './book/dom.ts'
import { headingLabel } from './book/types.ts'
import { headingListing } from './heading-listing.ts'
import { resolvePrintedPageHtml } from './markdown.ts'
import { printedSectionOutlineHtml } from './printed-section-flows.ts'
import { parse } from './sanitize.ts'

function sourceFacts(html: string): { blocks: string[]; headings: OutlineHeading[] } {
  const blocks: string[] = []
  const headings: OutlineHeading[] = []
  const visit = (nodes: readonly ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      const block = node.attribs['data-segnavia-id'] ?? node.attribs['data-segnavia-flow']
      if (block) blocks.push(block)
      const match = /^h([1-6])$/.exec(node.name)
      if (match && block) {
        headings.push({
          id: node.attribs.id ?? block,
          title: headingText(node).replace(/\s+/g, ' ').trim(),
          level: Number(match[1]),
          listed: headingListing(node),
          block,
        })
      }
      visit(node.children)
    }
  }
  visit(parse(html).children)
  return { blocks, headings }
}

export function documentOutlineSource(document: Document): OutlineSource {
  if (document.kind === 'book') {
    const book = bookFromDocument(document)
    const built = bookDocument(book)
    const facts = sourceFacts(built.html)
    return {
      direction: resolveDirection(book.dir, book.lang, book.title),
      depth: book.outline.depth,
      headings: built.headings.map((heading) => ({
        id: heading.id,
        title: headingLabel(heading),
        level: heading.level + (heading.depth ?? 0),
        listed: heading.listed,
        block: heading.block,
      })),
      blocks: facts.blocks,
    }
  }
  if (document.kind === 'printed') {
    const page = printedFromDocument(document)
    const sections = resolvePrintedPageHtml(page).printedPages.sections
    const facts = sourceFacts(sections.map(printedSectionOutlineHtml).join(''))
    return {
      direction: resolveDirection(page.dir, page.lang, facts.headings.map((heading) => heading.title).join(' ')),
      depth: page.printedPages?.outline.depth ?? 6,
      headings: facts.headings,
      blocks: facts.blocks,
    }
  }
  throw new Error(`document outline needs a book or printed document; use kind book or printed to clear this refusal`)
}
