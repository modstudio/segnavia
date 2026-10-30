import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { bookView } from '@segnavia/html'
import { filledBook, type MotifsOptions } from '@segnavia/render'
import { alefCss, notoCss } from './demo-book-fonts.ts'
import { BOOK_MOTIF_KEY, bookMotifSetup, bookMotifs } from './demo-book-motifs.ts'
import { noteCasesCss, noteCasesFixture } from './demo-book-note-fixtures.ts'

const BOOK_STYLE_CHECK_CSS = '.book-css-check{color:rgb(91, 42, 123);font-size:23px}'
const BOOK_CSS = `html{font:18px/1.55 Georgia,serif;scroll-behavior:auto}body{margin:0}.segnavia-section{box-sizing:border-box;min-block-size:520px;padding:24px 32px}.segnavia-contents{background:#f3efe4}.segnavia-chapter:nth-of-type(even){background:#edf4f6}.note-paragraph{min-block-size:360px}.segnavia-footnotes{border-block-start:1px solid;padding-block-start:12px}.segnavia-endnotes{background:#f6f0f4}h1{margin-block-start:0}a{color:#174f72}${BOOK_STYLE_CHECK_CSS}`

const fixture = (hebrew: boolean): BookInput => ({
  title: hebrew ? 'ספר ההפלגה' : 'The Book of Tides',
  mode: 'continuous',
  lang: hebrew ? 'he' : 'en',
  css: BOOK_CSS,
  frontMatter: [
    { title: hebrew ? 'שער' : 'Title page', html: `<h1>${hebrew ? 'ספר ההפלגה' : 'The Book of Tides'}</h1><p data-motif="${BOOK_MOTIF_KEY}"></p>` },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    {
      title: hebrew ? 'התחלה' : 'Beginning',
      html: `<h1>${hebrew ? 'התחלה' : 'Beginning'}</h1><p class="note-paragraph book-css-check">${
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
  return `<h1>${title}</h1><script data-segnavia-author-script>document.documentElement.setAttribute('data-segnavia-author-script-ran','')</script><p><span data-mark="kavana">${kavana}</span> <span data-mark="siman">${mark}</span> ${opening}<span data-note="footnote">${footnote}</span></p><p${pointed}>${body}</p><p>${hebrew ? 'סוף הפרק.' : 'The chapter closes.'}<span data-note="endnote">${end}</span></p>`
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

const designedCss =
  ':where(.designed-spread,.designed-leaf){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:24px;padding-inline:24px}:where(.designed-verso){background:#1a365d;color:#fff}:where(.designed-recto){background:#2c5282;color:#fff}:where(.designed-leaf){background:#edf2f7}:where(.designed-foot){text-align:center}:where(table){inline-size:100%;border-collapse:collapse}:where(th,td){border:1px solid;padding:4px}'

const markHead = (edge: 'start' | 'end') =>
  `<div class="haggadah-head"><span class="haggadah-kavana" data-motif="segnavia:mark" data-motif-name="kavana"></span><span class="haggadah-siman haggadah-siman-${edge}" data-motif="segnavia:mark" data-motif-name="siman"></span></div>`

const markParents = { recto: 'haggadah-recto', verso: 'haggadah-verso' } as const
const haggadahHeadCss =
  ':where(.haggadah-head){position:relative;block-size:100%;display:flex;align-items:center;justify-content:center}:where(.haggadah-siman){position:absolute}:where(.haggadah-siman-start){inset-inline-start:0}:where(.haggadah-siman-end){inset-inline-end:0}'

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
  parentPages: [
    { name: 'haggadah-recto', basedOn: 'segnavia:recto', head: markHead('end') },
    { name: 'haggadah-verso', basedOn: 'segnavia:verso', head: markHead('start') },
    {
      name: 'ornament-foot',
      basedOn: 'segnavia:blank',
      foot: '<div class="designed-foot"><span class="segnavia-folio" data-motif="segnavia:folio"></span><span aria-hidden="true"> ❧</span></div>',
    },
  ],
  frontMatter: [
    {
      title: hebrew ? 'פתיחה' : 'Preface',
      html: `<style>${designedCss}${hebrew ? `${alefCss()}${notoCss()}:where(html){font:16px/1.7 Alef,serif}:where([data-pointed]){font-family:NotoSerifHebrew,serif}` : ':where(html){font:16px/1.5 Georgia,serif}'}</style><p data-motif="${BOOK_MOTIF_KEY}"></p><p>${hebrew ? 'דברים שלפני הספר.' : 'Words before the book begins.'}</p>`,
    },
    { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
  ],
  chapters: [
    designedSpread(hebrew),
    { title: hebrew ? 'פרק ראשון' : 'Chapter One', html: chapterOneHtml(hebrew), parents: markParents },
    designedLeaf(hebrew),
    { title: hebrew ? 'פרק שני' : 'Chapter Two', html: chapterTwoHtml(hebrew), parents: markParents },
    { title: hebrew ? 'פרק שלישי' : 'Chapter Three', html: chapterThreeHtml(hebrew) },
    { title: hebrew ? 'פרק רביעי' : 'Chapter Four', html: chapterFourHtml(hebrew) },
    columnFitChapter(hebrew),
  ],
})

const workbookCss =
  ':where(.lesson){box-sizing:border-box;inline-size:100%;block-size:100%;padding-block:12px;padding-inline:12px;display:flex;flex-direction:column;gap:8px}:where(.lesson-heading){font-weight:700}:where(.lesson-reading){flex:none;block-size:3em;max-block-size:3em;overflow:visible}:where(.lesson-table table){inline-size:100%;border-collapse:collapse}:where(.lesson-table th,.lesson-table td){border:1px solid;padding:4px}:where(.copyright-page){box-sizing:border-box;inline-size:100%;block-size:100%;padding:24px}:where(.lesson-alt .lesson-table){order:-1}'

function lessonTable(hebrew: boolean): string {
  const head = hebrew ? '<th>אות</th><th>ערך</th>' : '<th>Letter</th><th>Value</th>'
  return `<table><thead><tr>${head}</tr></thead><tbody><tr><td>א</td><td>1</td></tr><tr><td>ב</td><td>2</td></tr></tbody></table>`
}

function workbookFixture(hebrew: boolean): BookInput {
  const lesson = hebrew ? 'שיעור' : 'Lesson'
  const reading = hebrew ? 'הטקסט לקריאה בשיעור.' : 'The reading text for this lesson.'
  const longReading = hebrew ? `${reading} `.repeat(8) : `${reading} `.repeat(8)
  return {
    title: hebrew ? 'חוברת הקריאה' : 'The Reading Workbook',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    rectoOpenings: true,
    slots: [{ key: 'school', label: hebrew ? 'בית ספר' : 'School', type: 'text', required: true }],
    templates: [
      {
        name: 'lesson',
        html: '<div class="lesson"><div class="lesson-heading" data-region="heading"></div><div class="lesson-reading" data-region="reading-text" style="block-size:3em;max-block-size:3em;overflow:visible"></div><div class="lesson-table" data-region="table" dir="rtl"></div></div>',
      },
      {
        name: 'lesson-alt',
        html: '<div class="lesson lesson-alt"><div class="lesson-heading" data-region="heading"></div><div class="lesson-reading" data-region="reading-text" style="block-size:3em;max-block-size:3em;overflow:visible"></div><div class="lesson-table" data-region="table" dir="rtl"></div></div>',
      },
    ],
    frontMatter: [
      {
        kind: 'designed',
        title: hebrew ? 'זכויות יוצרים' : 'Copyright',
        pages: [
          {
            html: `<div class="copyright-page"><p>© <span data-slot-value="school">${hebrew ? 'בית ספר' : 'School'}</span></p></div>`,
          },
        ],
      },
      { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
    ],
    chapters: [
      {
        kind: 'templated',
        title: hebrew ? 'שיעורים' : 'Lessons',
        template: 'lesson',
        pages: [
          {
            regions: {
              heading: `<h1 id="lesson-1">${lesson} 1</h1>`,
              'reading-text': `<p>${reading}</p>`,
              table: lessonTable(hebrew),
            },
          },
          {
            regions: {
              heading: `<h1 id="lesson-2">${lesson} 2</h1>`,
              'reading-text': `<p>${longReading}</p>`,
              table: lessonTable(hebrew),
            },
          },
          {
            template: 'lesson-alt',
            regions: {
              heading: `<h1 id="lesson-3">${lesson} 3</h1>`,
              'reading-text': `<p>${reading}</p>`,
              table: lessonTable(hebrew),
            },
          },
        ],
      },
    ],
  }
}

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

    const school = hebrew ? 'בית ספר הירדן' : 'Jordan School'
    const workbook = await filledBook(Book.parse(workbookFixture(hebrew)), { fill: { id: 'host', values: { school } } })
    const workbookCssFull = hebrew
      ? `${hebrewFace}${workbookCss}:where(html){font:16px/1.7 Alef,serif}`
      : `${workbookCss}:where(html){font:16px/1.5 Georgia,serif}`
    writeFileSync(
      path.join(site, hebrew ? 'book-workbook-he.html' : 'book-workbook-en.html'),
      paginatedBookDocument(workbook, { nonce: newNonce(), css: workbookCssFull }),
    )
  }
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
    path.join(site, 'book-workbook.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbooks</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}iframe{inline-size:100%;block-size:70vh;background:#fff;border:0}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><iframe id="book-workbook-en" sandbox="allow-scripts" src="book-workbook-en.html"></iframe></section><section class="book"><h2>עברית</h2><iframe id="book-workbook-he" sandbox="allow-scripts" src="book-workbook-he.html"></iframe></section></main></body></html>`,
  )
}
