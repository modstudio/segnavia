import { BOOK_PARENT_NAMES, type DocumentInput } from '@segnavia/format'

const placement = (name: string) =>
  `<div class="segnavia-running-head" data-motif="segnavia:head-template" data-motif-name="${name}"></div>`

export function titleHeadFixture(hebrew: boolean): DocumentInput {
  const bookTitle = hebrew ? 'ספר ההפלגה' : 'The Book of Tides'
  const sectionTitle = hebrew ? 'התחלה' : 'Beginning'
  const body = hebrew ? 'הספינה יצאה אל הים. ' : 'The ship went out with the morning tide. '
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: bookTitle },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en' },
    page: { paper: 'a4', margin: { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 15 } },
    variables: [
      { type: 'variable', name: 'book-title', kind: 'meta', field: 'title' },
      { type: 'variable', name: 'section-title', kind: 'text', from: 'section-title' },
    ],
    headTemplates: [
      { type: 'headTemplate', name: 'book-title', parts: [{ variable: 'book-title' }] },
      { type: 'headTemplate', name: 'section-title', parts: [{ variable: 'section-title' }] },
    ],
    parentPages: [
      { type: 'parentPage', name: 'title-recto', basedOn: BOOK_PARENT_NAMES.recto, head: placement('book-title') },
      { type: 'parentPage', name: 'title-verso', basedOn: BOOK_PARENT_NAMES.verso, head: placement('section-title') },
    ],
    parentRules: [
      { when: { blank: true }, parent: BOOK_PARENT_NAMES.blank },
      { when: { face: 'verso' }, parent: 'title-verso' },
      { parent: 'title-recto' },
    ],
    children: [
      {
        type: 'section',
        title: sectionTitle,
        children: [{ type: 'flow', html: `<h1>${sectionTitle}</h1><p>${body.repeat(500)}</p>` }],
      },
    ],
  }
}
