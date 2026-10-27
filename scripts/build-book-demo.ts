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

const notoCss = () => {
  const data = readFileSync(path.join(ROOT, 'fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')).toString('base64')
  return `@font-face{font-family:NotoSerifHebrew;src:url(data:font/ttf;base64,${data}) format('truetype');font-display:block}`
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
    ? 'בראשית ברא אלהים את השמים ואת הארץ והארץ היתה תהו ובהו '
    : 'The tide turned against the hull and the lanterns of the harbour receded into a thin gold line. '
  const markSpan = mark ? `<span data-mark="${mark}">${hebrew ? 'סימן ב' : 'Mark B'}</span> ` : ''
  return `<p data-columns="2">${markSpan}${words.repeat(lines)}</p>`
}

const longNote = (hebrew: boolean) =>
  hebrew ? 'הערה ארוכה שנמשכת אל העמוד הבא. '.repeat(40) : 'A footnote long enough to continue onto the next page, naming the source of the voyage. '.repeat(24)

const pointedRun = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃ וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ וְחֹ֖שֶׁךְ עַל־פְּנֵ֣י תְה֑וֹם וְר֣וּחַ אֱלֹהִ֔ים מְרַחֶ֖פֶת עַל־פְּנֵ֥י הַמָּֽיִם׃ '

function chapterOneHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק ראשון' : 'Chapter One'
  const mark = hebrew ? 'סימן א' : 'Mark A'
  const opening = hebrew ? 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ.' : 'The first morning of the voyage ran long against the wind.'
  const body = hebrew ? pointedRun.repeat(20) : 'The crew counted the miles by the creak of the mast. '.repeat(18)
  const pointed = hebrew ? ' data-pointed' : ''
  return `<h1>${title}</h1><p><span data-mark="siman">${mark}</span> ${opening}<span data-note="footnote">${longNote(hebrew)}</span></p><p${pointed}>${body}</p>`
}

function chapterTwoHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק שני' : 'Chapter Two'
  const lead = hebrew ? 'הטקסט המלא נמשך על פני העמוד.' : 'A full-width paragraph opens the chapter on its own line of the page.'
  const mid = hebrew ? 'שוב רוחב מלא בין העמודות.' : 'Full width returns between the column runs.'
  const close = hebrew ? 'סוף המעבר בין העמודות.' : 'The chapter closes after the column run is cut by a page break.'
  return `<h1>${title}</h1><p>${lead}</p>${columnRun(hebrew, 8, 'siman')}<p>${mid}</p>${columnRun(hebrew, 22)}<p>${close}</p>`
}

function chapterThreeHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק שלישי' : 'Chapter Three'
  const lead = hebrew ? 'עמוד בלי סימן נושא את הסימן הקודם.' : 'This chapter carries the last mark because it has none of its own.'
  const note = hebrew ? 'הערה קצרה.' : 'A short note.'
  const body = hebrew ? 'עוֹד פִּסְקָה מְנֻקֶּדֶת לְבֹחַן הַחַלּוֹן. '.repeat(10) : 'Further paragraphs keep the body moving across a second page. '.repeat(14)
  return `<h1>${title}</h1><p>${lead}<span data-note="footnote">${note}</span></p><p>${body}</p>`
}

const designedCss =
  ':where(.designed-spread,.designed-leaf){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:24px;padding-inline:24px}:where(.designed-verso){background:#1a365d;color:#fff}:where(.designed-recto){background:#2c5282;color:#fff}:where(.designed-leaf){background:#edf2f7}:where(.designed-foot){text-align:center}'

function designedSpread(hebrew: boolean) {
  const title = hebrew ? 'שער' : 'Frontispiece'
  const verso = hebrew ? 'גב השער' : 'Verso of the spread'
  const recto = hebrew ? 'פנים השער' : 'Recto of the spread'
  return {
    kind: 'designed' as const,
    title,
    opens: 'verso' as const,
    pages: [
      { html: `<div class="designed-spread designed-verso"><h1 id="spread-open">${title}</h1><p>${verso}</p></div>` },
      { html: `<div class="designed-spread designed-recto"><h2 id="spread-recto">${recto}</h2></div>` },
    ],
  }
}

function designedLeaf(hebrew: boolean) {
  const title = hebrew ? 'לוח' : 'Plate'
  return {
    kind: 'designed' as const,
    title,
    parents: { fixed: 'ornament-foot' },
    pages: [{ html: `<div class="designed-leaf"><h1 id="plate">${title}</h1></div>` }],
  }
}

const paginatedFixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'הגדת הדף' : 'The Paged Book',
  mode: 'paginated',
  lang: hebrew ? 'he' : 'en',
  page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 }, columnGap: 5 },
  rectoOpenings: true,
  runningHead: { recto: { mark: 'siman', which: 'first' }, verso: { mark: 'siman', which: 'first' } },
  parentPages: [
    {
      name: 'ornament-foot',
      basedOn: 'segnavia:blank',
      foot: '<div class="designed-foot"><span class="segnavia-folio" data-motif="segnavia:folio"></span><span aria-hidden="true"> ❧</span></div>',
    },
  ],
  frontMatter: [
    { title: hebrew ? 'פתיחה' : 'Preface', html: `<p>${hebrew ? 'דברים שלפני הספר.' : 'Words before the book begins.'}</p>` },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    designedSpread(hebrew),
    { title: hebrew ? 'פרק ראשון' : 'Chapter One', html: chapterOneHtml(hebrew) },
    designedLeaf(hebrew),
    { title: hebrew ? 'פרק שני' : 'Chapter Two', html: chapterTwoHtml(hebrew) },
    { title: hebrew ? 'פרק שלישי' : 'Chapter Three', html: chapterThreeHtml(hebrew) },
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

  const hebrewFace = `${alefCss()}${notoCss()}`
  for (const hebrew of [false, true]) {
    const book = Book.parse(paginatedFixture(hebrew))
    const css = hebrew
      ? `${hebrewFace}${designedCss}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}`
      : `${designedCss}:where(html){font:16px/1.5 Georgia,serif}`
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
