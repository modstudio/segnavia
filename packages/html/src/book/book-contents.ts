import { type Book, entryDirection, resolveDirection } from '@segnavia/format'
import { isTag } from 'domhandler'
import type { BuiltSection } from './book-held.ts'
import { CONTENTS_PAGE_REFERENCE_ATTRIBUTE, CONTENTS_PAGE_REFERENCE_CLASS, PAGE_REFERENCE_ATTRIBUTE, PAGE_REFERENCE_VALUE } from './book-page-reference.ts'
import { element, linkChildren, text } from './dom.ts'
import { type BookDocumentOptions, type BookHeading, headingLabel } from './types.ts'

function contentsList(book: Book, headings: BookHeading[], options: BookDocumentOptions) {
  const entries = headings.map((heading) => {
    const page = book.contents.pageNumbers ? (options.pageNumbers?.[heading.id] ?? '') : ''
    const label = headingLabel(heading)
    const level = heading.level + (heading.depth ?? 0)
    const attributes = {
      class: 'segnavia-contents-entry',
      'data-level': String(level),
      ...(heading.depth === undefined ? {} : { 'data-depth': String(heading.depth) }),
    }
    return element('li', attributes, [
      element(
        'a',
        {
          href: options.crossLinks ? `segnavia:target/${heading.id}` : `#${heading.id}`,
          dir: entryDirection(book, label),
        },
        [
          text(label),
          ...(heading.subtitle === undefined
            ? []
            : [
                element(
                  'span',
                  {
                    class: 'segnavia-contents-subtitle',
                    dir: entryDirection(book, heading.subtitle),
                  },
                  [text(heading.subtitle)],
                ),
              ]),
        ],
      ),
      book.contents.pageNumbers
        ? element(
            'a',
            {
              class: CONTENTS_PAGE_REFERENCE_CLASS,
              [CONTENTS_PAGE_REFERENCE_ATTRIBUTE]: '',
              href: `#${heading.id}`,
              [PAGE_REFERENCE_ATTRIBUTE]: PAGE_REFERENCE_VALUE,
            },
            [text(page)],
          )
        : element('span', { class: CONTENTS_PAGE_REFERENCE_CLASS }, []),
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
