import { type Book, resolveDirection } from '@segnavia/format'
import { isTag } from 'domhandler'
import type { BuiltSection } from './book-held.ts'
import { element, linkChildren, text } from './dom.ts'
import type { BookDocumentOptions, BookHeading } from './types.ts'

function contentsList(book: Book, headings: BookHeading[], options: BookDocumentOptions) {
  const entries = headings.map((heading) => {
    const page = book.contents.pageNumbers ? (options.pageNumbers?.[heading.id] ?? '') : ''
    const level = heading.level + (heading.depth ?? 0)
    const attributes = {
      class: 'segnavia-contents-entry',
      'data-level': String(level),
      ...(heading.depth === undefined ? {} : { 'data-depth': String(heading.depth) }),
    }
    return element('li', attributes, [
      element(
        'a',
        { href: options.crossLinks ? `segnavia:target/${heading.id}` : `#${heading.id}`, dir: resolveDirection(book.dir, book.lang, heading.text) },
        [text(heading.text)],
      ),
      book.contents.pageNumbers
        ? element(
            'a',
            {
              class: 'segnavia-contents-page',
              href: `#${heading.id}`,
              'data-ref': 'page',
              'data-target': heading.id,
              dir: resolveDirection(book.dir, book.lang, page),
            },
            [text(page)],
          )
        : element('span', { class: 'segnavia-contents-page' }, []),
    ])
  })
  return element('ol', { class: 'segnavia-contents-list' }, entries)
}

export function addContents(book: Book, section: BuiltSection, headings: BookHeading[], options: BookDocumentOptions): void {
  const title = section.info.title
  const titleNode = section.node.children.find((child) => isTag(child) && child.name === 'h1')
  if (title !== undefined && titleNode && isTag(titleNode)) titleNode.attribs.dir = resolveDirection(book.dir, book.lang, title)
  section.node.children.push(contentsList(book, headings, options))
  linkChildren(section.node)
}
