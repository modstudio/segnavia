import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { bookView } from '@segnavia/html'
import { filledBook, type MotifsOptions } from '@segnavia/render'
import { writeHiddenBookDemo } from './book-hidden-demo.ts'
import { alefCss, BOOK_CSS, BOOK_STYLE_CHECK_CSS, designedCss, notoCss } from './demo-book-fonts.ts'
import { BOOK_FOLIO_MOTIF_KEY, BOOK_MOTIF_KEY, bookMotifSetup, bookMotifs } from './demo-book-motifs.ts'
import { noteCasesCss, noteCasesFixture } from './demo-book-note-fixtures.ts'
import { noteSeriesFixture, twoPageSeriesFixture } from './demo-book-note-series-fixtures.ts'
import { haggadahHeadCss, markParents, paginatedParents } from './demo-book-parents.ts'
import { partsFixture } from './demo-book-parts-fixtures.ts'
import { workbookCss, workbookFixture } from './demo-book-workbook-fixtures.ts'

const fixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'ספר ההפלגה' : 'The Book of Tides',
  mode: 'continuous',
  lang: hebrew ? 'he' : 'en',
  css: BOOK_CSS,
  frontMatter: [
    {
      title: hebrew ? 'שער' : 'Title page',
      contents: false,
      html: `<h1>${hebrew ? 'ספר ההפלגה' : 'The Book of Tides'}</h1><p data-motif="${BOOK_MOTIF_KEY}"></p>`,
    },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    {
      title: hebrew ? 'התחלה' : 'Beginning',
      html: `<h1>${hebrew ? 'התחלה' : 'Beginning'}</h1><p class="note-paragraph book-css-check">${
        hebrew ? 'הספינה יצאה אל הים' : 'The ship went out with the morning tide'
      }<span data-note="footnote">${hebrew ? 'הערת שוליים על ההפלגה.' : 'A footnote about the voyage.'}</span>.</p><p>${
        hebrew ? 'ראו עמ׳ ' : 'See page '
      }<a href="#far-shore" data-ref="page"></a>.</p>`,
    },
    {
      title: hebrew ? 'החוף הרחוק' : 'The Far Shore',
      html: `<h1 id="far-shore">${hebrew ? 'החוף הרחוק' : 'The Far Shore'}</h1><p class="note-paragraph">${
        hebrew ? 'בקצה המסע נמצא חוף חדש' : 'At the end of the crossing was another shore'
      }<span data-note="endnote">${hebrew ? 'מקור להערת הסיום.' : 'The source for the endnote.'}</span>.</p>`,
    },
  ],
})
const columnRun = (hebrew: boolean, lines: number, mark?: string) => {
  const words = hebrew
    ? 'בראשית ברא אלהים את השמים ואת הארץ והארץ היתה תהו ובהו '
    : 'The tide turned against the hull and the lanterns of the harbor receded into a thin gold line. '
  const markSpan = mark ? `<span data-mark="${mark}">${hebrew ? 'סימן ב' : 'Mark B'}</span> ` : ''
  return `<p data-columns="2">${markSpan}${words.repeat(lines)}</p>`
}
const longNote = (hebrew: boolean) =>
  hebrew ? 'הערה ארוכה שנמשכת אל העמוד הבא. '.repeat(40) : 'A footnote long enough to continue onto the next page, naming the source of the voyage. '.repeat(24)
const pointedRun = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃ וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ וְחֹ֖שֶׁךְ עַל־פְּנֵ֣י תְה֑וֹם וְר֣וּחַ אֱלֹהִ֔ים מְרַחֶ֖פֶת עַל־פְּנֵ֥י הַמָּֽיִם׃ '
function chapterOneHtml(hebrew: boolean, footnote = longNote(hebrew)): string {
  const title = hebrew ? 'פרק ראשון' : 'Chapter One'
  const mark = hebrew ? 'סימן א' : 'Mark A'
  const kavana = hebrew ? 'כוונה א' : 'Intention A'
  const opening = hebrew ? 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ.' : 'The first morning of the voyage ran long against the wind.'
  const body = hebrew ? pointedRun.repeat(20) : 'The crew counted the miles by the creak of the mast. '.repeat(18)
  const pointed = hebrew ? ' data-pointed' : ''
  const end = hebrew ? 'מקור לפרק הראשון.' : 'The source for the first chapter.'
  return `<h1>${title}</h1><script data-segnavia-author-script>document.documentElement.setAttribute('data-segnavia-author-script-ran','')</script><p><span data-mark="kavana">${kavana}</span> <span data-mark="siman">${mark}</span> ${opening}<span data-note="footnote">${footnote}</span></p><p>${hebrew ? 'ראו עמ׳ ' : 'See page '}<a href="#segnavia-chapter-3" data-ref="page"></a>.</p><p${pointed}>${body}</p><p>${hebrew ? 'סוף הפרק.' : 'The chapter closes.'}<span data-note="endnote">${end}</span></p>`
}
function chapterTwoHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק שני' : 'Chapter Two'
  const lead = hebrew ? 'הטקסט המלא נמשך על פני העמוד.' : 'A full-width paragraph opens the chapter on its own line of the page.'
  const mid = hebrew ? 'שוב רוחב מלא בין העמודות.' : 'Full width returns between the column runs.'
  const close = hebrew ? 'סוף המעבר בין העמודות.' : 'The chapter closes after the column run is cut by a page break.'
  return `<h1>${title}</h1><p>${lead}</p>${columnRun(hebrew, 8, 'siman')}<p>${mid}</p>${columnRun(hebrew, 22)}<p>${close}</p>`
}
function columnFitChapter(hebrew: boolean) {
  const title = hebrew ? 'בדיקת עמודות' : 'Column Fit'
  const padded = 'The tide turned against the hull and the lanterns of the harbor receded into a thin gold line. '.repeat(8)
  return {
    title,
    html: `<h1>${title}</h1><p dir="ltr" data-columns="2" data-column-fit-check style="margin-inline-start:6pt;margin-inline-end:4pt;padding-inline-start:20pt;padding-inline-end:5pt">${padded}</p>`,
  }
}

function chapterThreeHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק שלישי' : 'Chapter Three'
  const lead = hebrew ? 'עמוד בלי סימן נושא את הסימן הקודם.' : 'This chapter carries the last mark because it has none of its own.'
  const note = hebrew ? 'הערה קצרה.' : 'A short note.'
  const body = hebrew ? 'עוֹד פִּסְקָה מְנֻקֶּדֶת לְבֹחַן הַחַלּוֹן. '.repeat(10) : 'Further paragraphs keep the body moving across a second page. '.repeat(14)
  return `<h1>${title}</h1><p>${lead}<span data-note="footnote">${note}</span></p><p>${body}</p>`
}

function chapterFourHtml(hebrew: boolean): string {
  const title = hebrew ? 'פרק רביעי' : 'Chapter Four'
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="2400"><rect width="240" height="2400" fill="#2b6cb0"/><text x="16" y="64" fill="#fff" font-size="28">${hebrew ? 'תמונה' : 'Image'}</text></svg>`,
  )
  const image = `<img alt="${hebrew ? 'תמונה גבוהה' : 'A tall image'}" src="data:image/svg+xml,${svg}">`
  const head = hebrew ? '<th>אות</th><th>ערך</th>' : '<th>Letter</th><th>Value</th>'
  const letters = hebrew ? 'אבגדהוזחטיכלמנסעפצקרשת' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const rows = Array.from({ length: 40 }, (_, index) => `<tr><td>${letters[index % letters.length]}</td><td>${index + 1}</td></tr>`).join('')
  const table = `<table${hebrew ? ' dir="rtl"' : ''}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
  const end = hebrew ? 'מקור לפרק הרביעי.' : 'The source for the fourth chapter.'
  return `<h1>${title}</h1>${image}${table}<p>${hebrew ? 'הערת סיום.' : 'An endnote.'}<span data-note="endnote">${end}</span></p>`
}

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
    pages: [{ html: `<div class="designed-leaf"><h1 id="plate" class="book-css-check">${title}</h1></div>` }],
  }
}

const paginatedFixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'הגדת הדף' : 'The Paged Book',
  mode: 'paginated',
  lang: hebrew ? 'he' : 'en',
  css: BOOK_STYLE_CHECK_CSS,
  page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 }, columnGap: 5 },
  rectoOpenings: true,
  endnotes: { placement: 'chapter' },
  runningHead: { recto: { mark: 'siman', which: 'first' }, verso: { mark: 'siman', which: 'first' } },
  parentPages: paginatedParents(BOOK_FOLIO_MOTIF_KEY),
  frontMatter: [
    {
      title: hebrew ? 'פתיחה' : 'Preface',
      html: `<style>${designedCss}${hebrew ? `${alefCss()}${notoCss()}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}` : ':where(html){font:16px/1.5 Georgia,serif}'}</style><p><span data-motif="${BOOK_MOTIF_KEY}"></span> ${hebrew ? 'דברים שלפני הספר.' : 'Words before the book begins.'}</p>`,
    },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    designedSpread(hebrew),
    { title: hebrew ? 'פרק ראשון' : 'Chapter One', html: chapterOneHtml(hebrew), parents: { ...markParents, opener: 'deep-opener' } },
    designedLeaf(hebrew),
    {
      title: hebrew ? 'פרק שני' : 'Chapter Two',
      html: chapterTwoHtml(hebrew),
      parents: { opener: 'wide-opener', recto: 'wide-recto', verso: 'wide-verso' },
    },
    { title: hebrew ? 'פרק שלישי' : 'Chapter Three', html: chapterThreeHtml(hebrew) },
    { title: hebrew ? 'פרק רביעי' : 'Chapter Four', html: chapterFourHtml(hebrew) },
    columnFitChapter(hebrew),
  ],
})

function writeNoteCaseBook(site: string, hebrew: boolean, hebrewFace: string): void {
  const css = hebrew ? `${hebrewFace}${noteCasesCss()}:where(html){font:16px/1.7 Alef,serif}` : `${noteCasesCss()}:where(html){font:16px/1.5 Georgia,serif}`
  writeFileSync(
    path.join(site, hebrew ? 'book-paginated-notes-he.html' : 'book-paginated-notes-en.html'),
    paginatedBookDocument(Book.parse(noteCasesFixture(hebrew)), { nonce: newNonce(), css }),
  )
}

function writeOversizeBook(site: string, hebrew: boolean, css: string): void {
  const oversize = Book.parse({
    title: hebrew ? 'ספר גדול' : 'The Oversize Book',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    chapters: [{ title: hebrew ? 'פרק' : 'Chapter', html: `<pre style="font-size:900px;line-height:1;margin:0">${hebrew ? 'א' : 'X'}</pre>` }],
  })
  writeFileSync(
    path.join(site, hebrew ? 'book-paginated-oversize-he.html' : 'book-paginated-oversize-en.html'),
    paginatedBookDocument(oversize, { nonce: newNonce(), css }),
  )
}

function writePartsBook(site: string, hebrew: boolean, hebrewFace: string): void {
  writeFileSync(
    path.join(site, hebrew ? 'book-parts-he.html' : 'book-parts-en.html'),
    paginatedBookDocument(Book.parse(partsFixture(hebrew)), { nonce: newNonce(), css: hebrew ? hebrewFace : undefined }),
  )
}

function writeNoteSeriesBook(site: string, hebrew: boolean, hebrewFace: string): void {
  writeFileSync(
    path.join(site, hebrew ? 'book-note-series-he.html' : 'book-note-series-en.html'),
    paginatedBookDocument(Book.parse(noteSeriesFixture(hebrew)), { nonce: newNonce(), css: hebrew ? hebrewFace : undefined }),
  )
}

function writeTwoPageSeriesBook(site: string, hebrew: boolean, hebrewFace: string): void {
  const css = hebrew ? `${hebrewFace}:where(html){font:16px/1.7 Alef,serif}` : ':where(html){font:16px/1.5 Georgia,serif}'
  writeFileSync(
    path.join(site, hebrew ? 'book-two-page-series-he.html' : 'book-two-page-series-en.html'),
    paginatedBookDocument(Book.parse(twoPageSeriesFixture(hebrew)), { nonce: newNonce(), css }),
  )
}

export function largePaginatedFixture(hebrew: boolean): BookInput {
  // Regular paginated fixtures exercise continued notes. This stress fixture keeps a real short
  // footnote because Poppler reports clipped continuation fragments as in-clip bbox words.
  const footnote = hebrew ? 'הערה קצרה לספר הגדול.' : 'A short footnote for the large book.'
  const chapters = Array.from({ length: hebrew ? 40 : 54 }, (_, cycle) => {
    const number = cycle * 3
    return [
      { title: `${hebrew ? 'פרק ראשון' : 'Chapter One'} ${number + 1}`, html: chapterOneHtml(hebrew, footnote) },
      { title: `${hebrew ? 'פרק שני' : 'Chapter Two'} ${number + 2}`, html: chapterTwoHtml(hebrew) },
      { title: `${hebrew ? 'פרק שלישי' : 'Chapter Three'} ${number + 3}`, html: chapterThreeHtml(hebrew) },
    ]
  }).flat()
  return {
    title: hebrew ? 'ספר בן שלוש מאות עמודים' : 'The Three Hundred Page Book',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    rectoOpenings: true,
    endnotes: { placement: 'chapter' },
    // Regular paginated fixtures cover numbered contents; this stress fixture keeps pdftotext's
    // spatial column ordering from obscuring its order-sensitive per-page text comparison.
    contents: { pageNumbers: false, depth: 2 },
    frontMatter: [
      {
        title: hebrew ? 'פתיחה' : 'Preface',
        html: `<style>${designedCss}${hebrew ? `${alefCss()}${notoCss()}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}` : ':where(html){font:16px/1.5 Georgia,serif}'}</style><p>${hebrew ? pointedRun.repeat(3) : 'A flowing preface for the large book.'}</p>`,
      },
      { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
    ],
    chapters,
  }
}

export async function buildLargeBookPdfs(site: string, render: (book: BookInput) => Promise<Uint8Array<ArrayBufferLike>>): Promise<void> {
  for (const hebrew of [false, true]) {
    writeFileSync(path.join(site, `book-paginated-large-${hebrew ? 'he' : 'en'}.pdf`), await render(largePaginatedFixture(hebrew)))
  }
}

export async function buildNoteCasePdfs(site: string, render: (book: BookInput, css: string) => Promise<Uint8Array<ArrayBufferLike>>): Promise<void> {
  const hebrewFace = `${alefCss()}${notoCss()}`
  for (const hebrew of [false, true]) {
    const css = hebrew ? `${hebrewFace}${noteCasesCss()}:where(html){font:16px/1.7 Alef,serif}` : `${noteCasesCss()}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(path.join(site, `book-paginated-notes-${hebrew ? 'he' : 'en'}.pdf`), await render(noteCasesFixture(hebrew), css))
  }
}

export async function buildBookPdfs(
  site: string,
  bookPdf: (book: BookInput, options?: { css?: string; motifs?: MotifsOptions }) => Promise<Uint8Array<ArrayBufferLike>>,
): Promise<void> {
  for (const hebrew of [false, true]) {
    const css = hebrew
      ? `${alefCss()}${notoCss()}${designedCss}${haggadahHeadCss}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}`
      : `${designedCss}${haggadahHeadCss}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(
      path.join(site, `book-${hebrew ? 'he' : 'en'}.pdf`),
      await bookPdf({ ...fixture(hebrew), page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } } }, { motifs: bookMotifs }),
    )
    writeFileSync(path.join(site, `book-paginated-${hebrew ? 'he' : 'en'}.pdf`), await bookPdf(paginatedFixture(hebrew), { css, motifs: bookMotifs }))
    writeFileSync(path.join(site, `book-parts-${hebrew ? 'he' : 'en'}.pdf`), await bookPdf(partsFixture(hebrew)))
  }
  await buildLargeBookPdfs(site, (book) => bookPdf(book))
  await buildNoteCasePdfs(site, (book, css) => bookPdf(book, { css }))
}

export async function buildBookDemo(site: string): Promise<void> {
  writeFileSync(path.join(site, 'book-en.json'), JSON.stringify(bookView(Book.parse(fixture(false)))))
  writeFileSync(path.join(site, 'book-he.json'), JSON.stringify(bookView(Book.parse(fixture(true)))))
  writeFileSync(
    path.join(site, 'book.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuous books</title><style>
      html,body{margin:0;block-size:100%;overflow:hidden}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}.book segnavia-book{block-size:400px;background:#fff}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><segnavia-book id="book-en" src="book-en.json"></segnavia-book></section><section class="book"><h2>עברית</h2><segnavia-book id="book-he" src="book-he.json"></segnavia-book></section></main><script type="module" src="segnavia.js"></script>${bookMotifSetup}</body></html>`,
  )

  const hebrewFace = `${alefCss()}${notoCss()}`
  for (const hebrew of [false, true]) {
    const book = Book.parse(paginatedFixture(hebrew))
    const css = hebrew
      ? `${hebrewFace}${designedCss}${haggadahHeadCss}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}`
      : `${designedCss}${haggadahHeadCss}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(path.join(site, hebrew ? 'book-paginated-he.html' : 'book-paginated-en.html'), paginatedBookDocument(book, { nonce: newNonce(), css }))
    writePartsBook(site, hebrew, hebrewFace)
    writeFileSync(path.join(site, hebrew ? 'book-paginated-he.json' : 'book-paginated-en.json'), JSON.stringify(bookView(Book.parse(paginatedFixture(hebrew)))))
    writeFileSync(
      path.join(site, hebrew ? 'book-paginated-large-he.json' : 'book-paginated-large-en.json'),
      JSON.stringify(bookView(Book.parse(largePaginatedFixture(hebrew)))),
    )
    writeFileSync(
      path.join(site, hebrew ? 'book-paginated-large-he.html' : 'book-paginated-large-en.html'),
      paginatedBookDocument(Book.parse(largePaginatedFixture(hebrew)), { nonce: newNonce() }),
    )
    writeOversizeBook(site, hebrew, css)
    writeNoteCaseBook(site, hebrew, hebrewFace)
    writeNoteSeriesBook(site, hebrew, hebrewFace)
    writeTwoPageSeriesBook(site, hebrew, hebrewFace)

    const school = hebrew ? 'בית ספר הירדן' : 'Jordan School'
    const workbook = await filledBook(Book.parse(workbookFixture(hebrew)), { fill: { id: 'host', values: { school } } })
    const workbookCssFull = hebrew
      ? `${hebrewFace}${workbookCss}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}`
      : `${workbookCss}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(
      path.join(site, hebrew ? 'book-workbook-he.html' : 'book-workbook-en.html'),
      paginatedBookDocument(workbook, { nonce: newNonce(), css: workbookCssFull }),
    )
  }
  writeFileSync(
    path.join(site, 'book-parts.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Books with parts</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-parts-en" sandbox="allow-scripts" src="book-parts-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-parts-he" sandbox="allow-scripts" src="book-parts-he.html"></iframe></section></main></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-paginated.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paginated books</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-paginated-en" sandbox="allow-scripts" src="book-paginated-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-paginated-he" sandbox="allow-scripts" src="book-paginated-he.html"></iframe></section></main></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-paginated-screen.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paginated book elements</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}segnavia-book{display:block;block-size:70vh;background:#fff}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><segnavia-book id="book-screen-en" src="book-paginated-en.json"></segnavia-book></section><section class="book"><h2>עברית</h2><segnavia-book id="book-screen-he" spread src="book-paginated-he.json"></segnavia-book></section></main><script type="module" src="segnavia.js"></script>${bookMotifSetup}</body></html>`,
  )
  writeHiddenBookDemo(site)
  writeFileSync(
    path.join(site, 'book-paginated-large.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Large paginated book elements</title><style>
      html,body{margin:0}body{display:grid;grid-template-columns:1fr 1fr;gap:16px}segnavia-book{display:block;block-size:70vh}
    </style></head><body><segnavia-book id="book-large-en" src="book-paginated-large-en.json"></segnavia-book><segnavia-book id="book-large-he" src="book-paginated-large-he.json"></segnavia-book><script type="module" src="segnavia.js"></script></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-paginated-notes.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paginated note cases</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-paginated-notes-en" sandbox="allow-scripts" src="book-paginated-notes-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-paginated-notes-he" sandbox="allow-scripts" src="book-paginated-notes-he.html"></iframe></section></main></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-note-series.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two note series</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-note-series-en" sandbox="allow-scripts" src="book-note-series-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-note-series-he" sandbox="allow-scripts" src="book-note-series-he.html"></iframe></section></main></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-two-page-series.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two page note series</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-two-page-series-en" sandbox="allow-scripts" src="book-two-page-series-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-two-page-series-he" sandbox="allow-scripts" src="book-two-page-series-he.html"></iframe></section></main></body></html>`,
  )
  writeFileSync(
    path.join(site, 'book-workbook.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbooks</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-workbook-en" sandbox="allow-scripts" src="book-workbook-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-workbook-he" sandbox="allow-scripts" src="book-workbook-he.html"></iframe></section></main></body></html>`,
  )
}
