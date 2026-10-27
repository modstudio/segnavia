import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { bookView } from '@segnavia/html'

const ROOT = path.resolve(import.meta.dir, '..')
const BOOK_CSS = `<style>
html{font:18px/1.55 Georgia,serif;scroll-behavior:auto}body{margin:0}.segnavia-section{box-sizing:border-box;min-block-size:520px;padding:24px 32px}.segnavia-contents{background:#f3efe4}.segnavia-chapter:nth-of-type(even){background:#edf4f6}.note-paragraph{min-block-size:360px}.segnavia-footnotes{border-block-start:1px solid;padding-block-start:12px}.segnavia-endnotes{background:#f6f0f4}h1{margin-block-start:0}a{color:#174f72}
</style>`

const alefCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/Alef-Regular.ttf')).toString('base64')
  return `@font-face{font-family:Alef;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
}

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

const columnRun = (hebrew: boolean, lines: number, mark?: string) => {
  const words = hebrew
    ? 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ '
    : 'The tide turned against the hull and the lanterns of the harbour receded into a thin gold line. '
  const markSpan = mark ? `<span data-mark="${mark}">${hebrew ? 'סימן ב' : 'Mark B'}</span> ` : ''
  return `<p data-columns="2">${markSpan}${words.repeat(lines)}</p>`
}

const longNote = (hebrew: boolean) =>
  hebrew ? 'הערה ארוכה שנמשכת אל העמוד הבא. '.repeat(40) : 'A footnote long enough to continue onto the next page, naming the source of the voyage. '.repeat(24)

const paginatedFixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'הגדת הדף' : 'The Paged Book',
  mode: 'paginated',
  lang: hebrew ? 'he' : 'en',
  page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 }, columnGap: 5 },
  rectoOpenings: true,
  runningHead: { recto: { mark: 'siman', which: 'first' }, verso: { mark: 'siman', which: 'first' } },
  frontMatter: [
    { title: hebrew ? 'פתיחה' : 'Preface', html: `<p>${hebrew ? 'דברים שלפני הספר.' : 'Words before the book begins.'}</p>` },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    {
      title: hebrew ? 'פרק ראשון' : 'Chapter One',
      html: `<h1>${hebrew ? 'פרק ראשון' : 'Chapter One'}</h1><p><span data-mark="siman">${hebrew ? 'סימן א' : 'Mark A'}</span> ${
        hebrew ? 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ.' : 'The first morning of the voyage ran long against the wind.'
      }<span data-note="footnote">${longNote(hebrew)}</span></p><p>${
        hebrew ? 'וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל־פְּנֵי תְהוֹם. '.repeat(12) : 'The crew counted the miles by the creak of the mast. '.repeat(18)
      }</p>`,
    },
    {
      title: hebrew ? 'פרק שני' : 'Chapter Two',
      html: `<h1>${hebrew ? 'פרק שני' : 'Chapter Two'}</h1><p>${
        hebrew ? 'הטקסט המלא נמשך על פני העמוד.' : 'A full-width paragraph opens the chapter on its own line of the page.'
      }</p>${columnRun(hebrew, 8, 'siman')}<p>${
        hebrew ? 'שוב רוחב מלא בין העמודות.' : 'Full width returns between the column runs.'
      }</p>${columnRun(hebrew, 22)}<p>${hebrew ? 'סוף המעבר בין העמודות.' : 'The chapter closes after the column run is cut by a page break.'}</p>`,
    },
    {
      title: hebrew ? 'פרק שלישי' : 'Chapter Three',
      html: `<h1>${hebrew ? 'פרק שלישי' : 'Chapter Three'}</h1><p>${
        hebrew ? 'עמוד בלי סימן נושא את הסימן הקודם.' : 'This chapter carries the last mark because it has none of its own.'
      }<span data-note="footnote">${hebrew ? 'הערה קצרה.' : 'A short note.'}</span></p><p>${
        hebrew ? 'עוֹד פִּסְקָה מְנֻקֶּדֶת לְבֹחַן הַחַלּוֹן. '.repeat(10) : 'Further paragraphs keep the body moving across a second page. '.repeat(14)
      }</p>`,
    },
  ],
})

export function buildBookDemo(site: string): void {
  writeFileSync(path.join(site, 'book-en.json'), JSON.stringify(bookView(Book.parse(fixture(false)))))
  writeFileSync(path.join(site, 'book-he.json'), JSON.stringify(bookView(Book.parse(fixture(true)))))
  writeFileSync(
    path.join(site, 'book.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuous books</title><style>
      html,body{margin:0;block-size:100%;overflow:hidden}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}.book segnavia-book{block-size:400px;background:#fff}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><segnavia-book id="book-en" src="book-en.json"></segnavia-book></section><section class="book"><h2>עברית</h2><segnavia-book id="book-he" src="book-he.json"></segnavia-book></section></main><script type="module" src="segnavia.js"></script></body></html>`,
  )

  const hebrewFace = alefCss()
  for (const hebrew of [false, true]) {
    const book = Book.parse(paginatedFixture(hebrew))
    const css = hebrew ? `${hebrewFace}:where(html){font:16px/1.7 Alef,serif}` : ':where(html){font:16px/1.5 Georgia,serif}'
    writeFileSync(path.join(site, hebrew ? 'book-paginated-he.html' : 'book-paginated-en.html'), paginatedBookDocument(book, { nonce: newNonce(), css }))
    writeFileSync(path.join(site, hebrew ? 'book-paginated-he.json' : 'book-paginated-en.json'), JSON.stringify(bookView(book)))
  }
  writeFileSync(
    path.join(site, 'book-paginated.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paginated books</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-paginated-en" sandbox="allow-scripts" src="book-paginated-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-paginated-he" sandbox="allow-scripts" src="book-paginated-he.html"></iframe></section></main></body></html>`,
  )
}
