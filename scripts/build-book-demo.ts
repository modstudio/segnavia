import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Book, type BookInput, type BookView } from '@segnavia/format'
import { bookDocument } from '@segnavia/html'

const BOOK_CSS = `<style>
html{font:18px/1.55 Georgia,serif;scroll-behavior:auto}body{margin:0}.segnavia-section{box-sizing:border-box;min-block-size:520px;padding:24px 32px}.segnavia-contents{background:#f3efe4}.segnavia-chapter:nth-of-type(even){background:#edf4f6}.note-paragraph{min-block-size:360px}.segnavia-footnotes{border-block-start:1px solid;padding-block-start:12px}.segnavia-endnotes{background:#f6f0f4}h1{margin-block-start:0}a{color:#174f72}
</style>`

const fixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'ספר ההפלגה' : 'The Book of Tides',
  mode: 'continuous',
  lang: hebrew ? 'he' : 'en',
  frontMatter: [{ kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' }],
  chapters: [
    {
      title: hebrew ? 'התחלה' : 'Beginning',
      html: `${BOOK_CSS}<h1>${hebrew ? 'התחלה' : 'Beginning'}</h1><p class="note-paragraph">${
        hebrew ? 'הספינה יצאה אל הים' : 'The ship went out with the morning tide'
      }<span data-note="footnote">${hebrew ? 'הערת שוליים על ההפלגה.' : 'A footnote about the voyage.'}</span>.</p>`,
    },
    {
      title: hebrew ? 'החוף הרחוק' : 'The Far Shore',
      html: `<h1>${hebrew ? 'החוף הרחוק' : 'The Far Shore'}</h1><p class="note-paragraph">${
        hebrew ? 'בקצה המסע נמצא חוף חדש' : 'At the end of the crossing was another shore'
      }<span data-note="endnote">${hebrew ? 'מקור להערת הסיום.' : 'The source for the endnote.'}</span>.</p>`,
    },
  ],
})

function view(input: BookInput): BookView {
  const book = Book.parse(input)
  const document = bookDocument(book)
  if (document.issues.length > 0) throw new Error(`The demo book has issues: ${document.issues.join('; ')}`)
  return { html: document.html, title: book.title, dir: book.dir, lang: book.lang, scripts: book.scripts }
}

export function buildBookDemo(site: string): void {
  writeFileSync(path.join(site, 'book-en.json'), JSON.stringify(view(fixture(false))))
  writeFileSync(path.join(site, 'book-he.json'), JSON.stringify(view(fixture(true))))
  writeFileSync(
    path.join(site, 'book.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuous books</title><style>
      html,body{margin:0;block-size:100%;overflow:hidden}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}.book segnavia-book{block-size:400px;background:#fff}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><segnavia-book id="book-en" src="book-en.json"></segnavia-book></section><section class="book"><h2>עברית</h2><segnavia-book id="book-he" src="book-he.json"></segnavia-book></section></main><script type="module" src="segnavia.js"></script></body></html>`,
  )
}
