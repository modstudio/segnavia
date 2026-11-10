import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { BOOK_PARENT_NAMES, bookFromDocument, type DocumentInput } from '@segnavia/format'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { parseDocument } from '@segnavia/html'

const placement = (name: string) => `<div class="segnavia-running-head title-head-${name}" data-motif="segnavia:head-template" data-motif-name="${name}"></div>`

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
      { type: 'parentPage', name: 'title-recto', basedOn: BOOK_PARENT_NAMES.recto, regions: { head: { edge: 'blockStart', html: placement('book-title') } } },
      {
        type: 'parentPage',
        name: 'title-verso',
        basedOn: BOOK_PARENT_NAMES.verso,
        regions: { head: { edge: 'blockStart', html: placement('section-title') } },
      },
    ],
    parentRules: [{ when: { blank: true }, parent: BOOK_PARENT_NAMES.blank }, { when: { face: 'verso' }, parent: 'title-verso' }, { parent: 'title-recto' }],
    children: [
      {
        type: 'section',
        title: sectionTitle,
        children: [{ type: 'flow', html: `<h1>${sectionTitle}</h1><p>${body.repeat(500)}</p>` }],
      },
    ],
  }
}

export function writeTitleHeadDemo(site: string, hebrewFace: string): void {
  for (const hebrew of [false, true]) {
    let id = 0
    const book = bookFromDocument(parseDocument(titleHeadFixture(hebrew), { newId: () => `title-head-${++id}` }))
    writeFileSync(
      path.join(site, hebrew ? 'book-title-heads-he.html' : 'book-title-heads-en.html'),
      bookValueDocument(book, { nonce: newNonce(), css: hebrew ? hebrewFace : undefined }),
    )
  }
  writeFileSync(
    path.join(site, 'book-title-heads.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Book title heads</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-title-heads-en" sandbox="allow-scripts" src="book-title-heads-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-title-heads-he" sandbox="allow-scripts" src="book-title-heads-he.html"></iframe></section></main></body></html>`,
  )
}
